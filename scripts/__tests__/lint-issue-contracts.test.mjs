import test from 'node:test';
import assert from 'node:assert/strict';
import { lintIssueContracts } from '../lint-issue-contracts.mjs';
import {
  READY_LOW_RISK_ISSUE,
  READY_HIGH_RISK_ISSUE,
  MALFORMED_ISSUE,
} from './fixtures.mjs';

test('issue-contract lint passes an eligible ready queue', () => {
  const result = lintIssueContracts([READY_LOW_RISK_ISSUE]);
  assert.equal(result.valid, true);
  assert.match(result.output, /1 of 1/);
});

test('issue-contract lint names malformed and risk-gated issues with remediation evidence', () => {
  const result = lintIssueContracts([MALFORMED_ISSUE, READY_HIGH_RISK_ISSUE]);
  assert.equal(result.valid, false);
  assert.match(result.output, /#104: malformed/);
  assert.match(result.output, /acceptance criteria/);
  assert.match(result.output, /#103: risk-gated/);
});
