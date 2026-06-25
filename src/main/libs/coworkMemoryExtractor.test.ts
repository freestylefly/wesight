import { expect,test } from 'vitest';

import { extractTurnMemoryChanges } from './coworkMemoryExtractor';

const assistantText = '好的，已了解。';

test('keeps the highest-confidence implicit memories when more than the cap qualify', () => {
  // Order matters: two lower-confidence candidates appear BEFORE the highest one.
  // preference (0.88) -> ownership (0.9) -> profile (0.93)
  const userText = '我喜欢深色主题。我养了一只猫。我叫张三。';

  const changes = extractTurnMemoryChanges({
    userText,
    assistantText,
    guardLevel: 'relaxed',
  });

  const implicitAdds = changes.filter((c) => !c.isExplicit && c.action === 'add');

  // Cap is 2 per turn.
  expect(implicitAdds).toHaveLength(2);

  // The profile fact (0.93) must survive even though it appears last, and the
  // lowest-confidence preference (0.88) must be the one dropped.
  const kept = implicitAdds.map((c) => c.text);
  expect(kept).toContain('我叫张三');
  expect(kept).toContain('我养了一只猫');
  expect(kept).not.toContain('我喜欢深色主题');

  // Sorted by confidence descending.
  expect(implicitAdds[0].confidence).toBeGreaterThanOrEqual(implicitAdds[1].confidence);
});

test('deduplicates identical implicit candidates within a single turn', () => {
  const userText = '我叫张三。我叫张三。';

  const changes = extractTurnMemoryChanges({
    userText,
    assistantText,
    guardLevel: 'relaxed',
  });

  const implicitAdds = changes.filter((c) => !c.isExplicit && c.action === 'add');
  expect(implicitAdds).toHaveLength(1);
  expect(implicitAdds[0].text).toBe('我叫张三');
});
