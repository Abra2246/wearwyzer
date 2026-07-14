// Minimal, dependency-free GitHub REST/GraphQL client for the autonomous
// engineering queue scripts. Uses Node's built-in fetch — no npm packages,
// matching this repo's no-package-manager rule (CLAUDE.md).
//
// Auth: reads GITHUB_TOKEN from the environment — the workflow's own
// `secrets.GITHUB_TOKEN` (see docs/AUTOMATION_WORKFLOW.md). No new secret
// is introduced by any script in this file.

const API_ROOT = 'https://api.github.com';

export function repoFromEnv(env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is not set (expected "owner/repo")');
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error(`GITHUB_REPOSITORY is malformed: "${repo}"`);
  return { owner, name };
}

export class GitHubClient {
  constructor({ token, owner, repo, fetchImpl = fetch } = {}) {
    if (!token) throw new Error('GITHUB_TOKEN is not set');
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.fetch = fetchImpl;
  }

  async request(method, path, body) {
    const res = await this.fetch(`${API_ROOT}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${res.statusText} — ${text}`);
    }
    return data;
  }

  async paginate(path) {
    const results = [];
    let page = 1;
    for (;;) {
      const sep = path.includes('?') ? '&' : '?';
      const batch = await this.request('GET', `${path}${sep}per_page=100&page=${page}`);
      results.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }
    return results;
  }

  listLabels() {
    return this.paginate(`/repos/${this.owner}/${this.repo}/labels`);
  }

  createLabel({ name, color, description }) {
    return this.request('POST', `/repos/${this.owner}/${this.repo}/labels`, { name, color, description });
  }

  updateLabel(name, { color, description }) {
    return this.request('PATCH', `/repos/${this.owner}/${this.repo}/labels/${encodeURIComponent(name)}`, {
      color,
      description,
    });
  }

  async listOpenIssuesWithLabel(label) {
    const items = await this.paginate(
      `/repos/${this.owner}/${this.repo}/issues?state=open&labels=${encodeURIComponent(label)}`
    );
    // The issues endpoint also returns PRs; exclude them.
    return items.filter((item) => !item.pull_request);
  }

  async listOpenPullRequestsWithLabel(label) {
    const prs = await this.paginate(`/repos/${this.owner}/${this.repo}/pulls?state=open`);
    return prs.filter((pr) => (pr.labels || []).some((l) => l.name === label));
  }

  getIssue(number) {
    return this.request('GET', `/repos/${this.owner}/${this.repo}/issues/${number}`);
  }

  getPullRequest(number) {
    return this.request('GET', `/repos/${this.owner}/${this.repo}/pulls/${number}`);
  }

  addLabels(issueNumber, labels) {
    return this.request('POST', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels`, { labels });
  }

  async removeLabel(issueNumber, label) {
    try {
      await this.request(
        'DELETE',
        `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`
      );
    } catch (err) {
      // Already absent — not an error for our purposes.
      if (!String(err.message).includes('404')) throw err;
    }
  }

  createComment(issueNumber, body) {
    return this.request('POST', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`, { body });
  }

  async listChangedFiles(prNumber) {
    const files = await this.paginate(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}/files`);
    return files.map((f) => f.filename);
  }

  /**
   * Branches whose ref path starts with `prefix` under `refs/heads/` — e.g.
   * `claude/issue-22-`. Unlike a single-branch lookup, this endpoint
   * returns `200` with an empty array when nothing matches rather than a
   * 404, so no error handling is needed for the "no branch yet" case.
   */
  async listMatchingBranchRefs(prefix) {
    const refs = await this.request(
      'GET',
      `/repos/${this.owner}/${this.repo}/git/matching-refs/heads/${encodeURIComponent(prefix)}`
    );
    return (refs || []).map((r) => ({ name: r.ref.replace(/^refs\/heads\//, ''), sha: r.object.sha }));
  }

  async getBranchLastCommitIso(branchName) {
    const data = await this.request(
      'GET',
      `/repos/${this.owner}/${this.repo}/branches/${encodeURIComponent(branchName)}`
    );
    return data.commit.commit.committer.date;
  }

  listOpenPullRequestsForBranch(branchName) {
    return this.paginate(
      `/repos/${this.owner}/${this.repo}/pulls?state=open&head=${this.owner}:${encodeURIComponent(branchName)}`
    );
  }

  async compareCommits(base, head) {
    const data = await this.request(
      'GET',
      `/repos/${this.owner}/${this.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
    );
    return (data.files || []).map((f) => f.filename);
  }

  createPullRequest({ title, head, base, body, draft = true }) {
    return this.request('POST', `/repos/${this.owner}/${this.repo}/pulls`, { title, head, base, body, draft });
  }

  listIssueComments(issueNumber) {
    return this.paginate(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`);
  }

  /**
   * Best-effort only: enriches watchdog status output with the most recent
   * workflow run for a branch, never gates a decision. Swallows any error
   * (missing Actions permission, renamed workflow file, etc.) and returns
   * `[]` rather than failing the whole watchdog pass over optional metadata.
   */
  async listWorkflowRunsForBranch(branchName, workflowFileName) {
    try {
      const data = await this.request(
        'GET',
        `/repos/${this.owner}/${this.repo}/actions/workflows/${encodeURIComponent(
          workflowFileName
        )}/runs?branch=${encodeURIComponent(branchName)}&per_page=1`
      );
      return data.workflow_runs || [];
    } catch {
      return [];
    }
  }

  /**
   * "Required" here means every discoverable commit status + check-run has
   * succeeded — this repo has no admin-level access to the branch
   * protection API's explicit required-checks list, so this is a
   * deliberate v1 simplification. Documented in docs/AUTOMATION_WORKFLOW.md.
   */
  async getCombinedChecksPassed(ref) {
    const [status, checkRuns] = await Promise.all([
      this.request('GET', `/repos/${this.owner}/${this.repo}/commits/${ref}/status`),
      this.request('GET', `/repos/${this.owner}/${this.repo}/commits/${ref}/check-runs`),
    ]);
    const runsOk = (checkRuns.check_runs || []).every((run) =>
      ['success', 'neutral', 'skipped'].includes(run.conclusion)
    );
    return status.state === 'success' && runsOk;
  }

  /**
   * Merge state for Mission Control v2's engineering source (issue #42):
   * draft/mergeable/review-decision aren't on the list-PRs response, only
   * the single-PR GET — same reason scripts/handoff-watchdog.mjs already
   * calls getPullRequest for one PR at a time instead of trusting the list.
   */
  async getPullRequestReviewDecision(prNumber) {
    const query = `query($owner:String!,$repo:String!,$number:Int!){
      repository(owner:$owner,name:$repo){
        pullRequest(number:$number){ reviewDecision }
      }
    }`;
    const res = await this.fetch(`${API_ROOT}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { owner: this.owner, repo: this.repo, number: prNumber } }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
    return json.data.repository.pullRequest.reviewDecision || null;
  }

  /**
   * Recently merged PRs (any label) — feeds Mission Control v2's automation
   * feed "merged" events. Bounded to the most recent 20 closed PRs sorted by
   * update time, filtered to ones that actually merged (a closed-without-merge
   * PR is a different, less interesting event and is left out of the feed).
   */
  async listRecentlyMergedPullRequests({ limit = 20 } = {}) {
    const prs = await this.request(
      'GET',
      `/repos/${this.owner}/${this.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${limit}`
    );
    return prs.filter((pr) => pr.merged_at);
  }

  /**
   * Most recent workflow runs across the whole repo (not scoped to one
   * workflow file or branch) — Mission Control v2's broader CI picture and
   * the ops-live-feed-refresh.yml generator's own heartbeat (issue #42 asks
   * for both). Best-effort: swallows failures the same way
   * listWorkflowRunsForBranch does, since this only ever enriches the
   * dashboard and never gates a decision.
   */
  async listRecentWorkflowRuns({ limit = 15 } = {}) {
    try {
      const data = await this.request('GET', `/repos/${this.owner}/${this.repo}/actions/runs?per_page=${limit}`);
      return data.workflow_runs || [];
    } catch {
      return [];
    }
  }

  /**
   * Latest GitHub Pages deployment status via the generic Deployments API
   * (`environment=github-pages`), which every repo with Pages enabled
   * exposes under the same `contents: read`-level access this token already
   * has — no new permission beyond `deployments: read`. Returns `null` on
   * any failure (Pages not enabled, no deploy yet) rather than throwing, so
   * the deployment source degrades to "offline" instead of crashing the CLI.
   */
  async getLatestPagesDeployment() {
    try {
      const deployments = await this.request(
        'GET',
        `/repos/${this.owner}/${this.repo}/deployments?environment=github-pages&per_page=1`
      );
      const latest = deployments[0];
      if (!latest) return null;
      const statuses = await this.request(
        'GET',
        `/repos/${this.owner}/${this.repo}/deployments/${latest.id}/statuses?per_page=1`
      );
      const latestStatus = statuses[0] || null;
      return {
        sha: latest.sha,
        createdIso: latest.created_at,
        state: latestStatus ? latestStatus.state : null,
        updatedIso: latestStatus ? latestStatus.updated_at : latest.created_at,
        environmentUrl: latestStatus ? latestStatus.environment_url : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * REST has no "resolved" field for review threads; GraphQL does. Same
   * token, same repo — no new secret or permission beyond what
   * pull-requests: read already grants.
   */
  async getUnresolvedReviewThreadCount(prNumber) {
    const query = `query($owner:String!,$repo:String!,$number:Int!){
      repository(owner:$owner,name:$repo){
        pullRequest(number:$number){
          reviewThreads(first:100){ nodes { isResolved } }
        }
      }
    }`;
    const res = await this.fetch(`${API_ROOT}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { owner: this.owner, repo: this.repo, number: prNumber } }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
    const nodes = json.data.repository.pullRequest.reviewThreads.nodes;
    return nodes.filter((n) => !n.isResolved).length;
  }
}

export function clientFromEnv(env = process.env) {
  const { owner, name } = repoFromEnv(env);
  return new GitHubClient({ token: env.GITHUB_TOKEN, owner, repo: name });
}
