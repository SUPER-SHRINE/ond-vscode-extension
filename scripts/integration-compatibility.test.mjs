import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsCompatibility } from './integration/compatibility.cjs';

test('0.4 compatibility fixtures and host tests follow the verified LSP version in either lane', () => {
  for (const version of ['0.1.3','0.3.0','0.3.99']) assert.equal(supportsCompatibility(version), false);
  for (const version of ['0.4.0','0.10.0','1.0.0']) assert.equal(supportsCompatibility(version), true);
});
