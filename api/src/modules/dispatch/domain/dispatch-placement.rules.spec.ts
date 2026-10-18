import { DispatchPlacement } from './dispatch-assignment.entity';
import { isSameSlot, mergePlacement, validatePlacement } from './dispatch-placement.rules';

function placement(overrides: Partial<DispatchPlacement> = {}): DispatchPlacement {
  return { gateCode: null, laneCode: null, yardId: null, slotCode: null, ...overrides };
}

describe('validatePlacement (F29, F31)', () => {
  it('chấp nhận gán riêng cổng, hoặc cổng kèm làn', () => {
    expect(validatePlacement(placement({ gateCode: 'B1' }))).toEqual([]);
    expect(validatePlacement(placement({ gateCode: 'B1', laneCode: 'B1-1' }))).toEqual([]);
  });

  it('chấp nhận gán ô đỗ khi có đủ khu và ô', () => {
    expect(validatePlacement(placement({ yardId: 'khu-a', slotCode: 'A01' }))).toEqual([]);
  });

  it('không chọn gì thì báo lỗi', () => {
    expect(validatePlacement(placement())).toEqual(['Phải chọn ít nhất một vị trí: cổng, làn hoặc ô đỗ trong bãi.']);
  });

  it('chọn ô mà thiếu khu, hoặc chọn khu mà thiếu ô, đều bị chặn', () => {
    expect(validatePlacement(placement({ slotCode: 'A01' }))).toContain('Chọn ô đỗ thì phải chọn khu bãi tương ứng.');
    expect(validatePlacement(placement({ yardId: 'khu-a' }))).toContain('Chọn khu bãi thì phải chọn ô đỗ cụ thể.');
  });

  it('chọn làn mà không chọn cổng thì bị chặn', () => {
    expect(validatePlacement(placement({ laneCode: 'B1-1' }))).toContain('Chọn làn thì phải chọn cổng tương ứng.');
  });
});

describe('mergePlacement — chuyển vị trí giữ nguyên trường không khai', () => {
  const current = placement({ gateCode: 'B1', laneCode: 'B1-1', yardId: 'khu-a', slotCode: 'A01' });

  it('trường không gửi lên thì giữ nguyên', () => {
    expect(mergePlacement(current, { slotCode: 'A02' })).toEqual({
      gateCode: 'B1',
      laneCode: 'B1-1',
      yardId: 'khu-a',
      slotCode: 'A02',
    });
  });

  it('gửi null tường minh là bỏ trống vị trí đó', () => {
    expect(mergePlacement(current, { yardId: null, slotCode: null })).toEqual({
      gateCode: 'B1',
      laneCode: 'B1-1',
      yardId: null,
      slotCode: null,
    });
  });
});

describe('isSameSlot', () => {
  it('nhận ra chuyển tại chỗ để khỏi tự chặn chính mình', () => {
    const current = placement({ yardId: 'khu-a', slotCode: 'A01' });
    expect(isSameSlot(current, placement({ yardId: 'khu-a', slotCode: 'A01', gateCode: 'B1' }))).toBe(true);
    expect(isSameSlot(current, placement({ yardId: 'khu-a', slotCode: 'A02' }))).toBe(false);
  });
});
