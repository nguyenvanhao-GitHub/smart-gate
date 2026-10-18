import { GateDirection } from '../../catalog/domain/border-facility.catalog';
import {
  GatePassageState,
  WorkflowGateEvaluation,
  checkGatePassage,
  evaluateGateConditions,
  gateRuleKey,
} from './gate-condition.rules';

function makeEvaluation(overrides: Partial<WorkflowGateEvaluation> = {}): WorkflowGateEvaluation {
  return {
    canOpen: true,
    statusColor: 'GREEN',
    blockingReasons: [],
    requiredCompletedSteps: ['Hải quan hoàn thành'],
    ...overrides,
  };
}

describe('gateRuleKey — chọn quy tắc theo luồng hồ sơ × chiều cổng', () => {
  it('phủ đủ bốn tình huống của evaluateGate', () => {
    expect(gateRuleKey(true, GateDirection.ENTRY)).toBe('B2_IN_EXPORT');
    expect(gateRuleKey(true, GateDirection.EXIT)).toBe('B1_EXPORT_EXIT');
    expect(gateRuleKey(false, GateDirection.ENTRY)).toBe('B1_IMPORT_ENTRY');
    expect(gateRuleKey(false, GateDirection.EXIT)).toBe('B2_IMPORT_EXIT');
  });
});

describe('evaluateGateConditions (F39)', () => {
  it('đủ nghiệp vụ thì cho qua, màu xanh', () => {
    const result = evaluateGateConditions(makeEvaluation());

    expect(result.canOpen).toBe(true);
    expect(result.statusColor).toBe('GREEN');
    expect(result.blockingReasons).toEqual([]);
  });

  it('chưa đủ điều kiện nghiệp vụ thì chặn và trả blockingReasons', () => {
    const result = evaluateGateConditions(
      makeEvaluation({ canOpen: false, statusColor: 'YELLOW', blockingReasons: ['Chưa hoàn thành Hải quan.'] }),
    );

    expect(result.canOpen).toBe(false);
    expect(result.blockingReasons).toEqual(['Chưa hoàn thành Hải quan.']);
  });

  it('hồ sơ đã ở mức đỏ thì giữ nguyên màu đỏ, không hạ xuống vàng', () => {
    const result = evaluateGateConditions(
      makeEvaluation({ canOpen: false, statusColor: 'RED', blockingReasons: ['Hồ sơ bị yêu cầu bổ sung.'] }),
    );

    expect(result.statusColor).toBe('RED');
  });

  it('liệt kê các bước nghiệp vụ bắt buộc', () => {
    const result = evaluateGateConditions(makeEvaluation());

    expect(result.requiredCompletedSteps).toEqual(['Hải quan hoàn thành']);
  });
});

describe('checkGatePassage — trình tự lượt vào/ra (F38)', () => {
  function state(overrides: Partial<GatePassageState> = {}): GatePassageState {
    return { alreadyLeft: false, hasAllowedEntry: false, hasAllowedExit: false, ...overrides };
  }

  it('cho vào lần đầu và cho ra sau khi đã vào đều hợp lệ', () => {
    expect(checkGatePassage(GateDirection.ENTRY, state())).toBeNull();
    expect(checkGatePassage(GateDirection.EXIT, state({ hasAllowedEntry: true }))).toBeNull();
  });

  it('hồ sơ đã rời cửa khẩu thì chặn mọi lượt cho qua', () => {
    expect(checkGatePassage(GateDirection.ENTRY, state({ alreadyLeft: true }))).toBe('ALREADY_LEFT');
    expect(checkGatePassage(GateDirection.EXIT, state({ alreadyLeft: true, hasAllowedEntry: true }))).toBe(
      'ALREADY_LEFT',
    );
  });

  it('cho ra khi chưa từng cho vào bị chặn', () => {
    expect(checkGatePassage(GateDirection.EXIT, state())).toBe('EXIT_BEFORE_ENTRY');
  });

  it('cho ra lần thứ hai (trùng chiều RA) bị chặn', () => {
    expect(checkGatePassage(GateDirection.EXIT, state({ hasAllowedEntry: true, hasAllowedExit: true }))).toBe(
      'DUPLICATE_EXIT',
    );
  });

  it('cho vào lại sau khi đã ra bị chặn', () => {
    expect(checkGatePassage(GateDirection.ENTRY, state({ hasAllowedEntry: true, hasAllowedExit: true }))).toBe(
      'ENTRY_AFTER_EXIT',
    );
  });

  it('cho vào lần thứ hai (trùng chiều VÀO) bị chặn', () => {
    expect(checkGatePassage(GateDirection.ENTRY, state({ hasAllowedEntry: true }))).toBe('DUPLICATE_ENTRY');
  });
});
