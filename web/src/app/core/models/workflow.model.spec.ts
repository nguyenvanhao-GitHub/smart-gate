import {
  WorkflowChecklistItem,
  WorkflowStep,
  buildChecklistColumns,
  decisionRequiresReasonNote,
  decisionShowsReasonCode,
  formatElapsed,
  isInspectionStep,
  isWorkflowQueueTab,
  orderStepsForDisplay,
  queueStateLabel,
  reasonScopeOf,
  workflowStepStatusLabel,
  workflowStepStatusTone,
} from './workflow.model';

/**
 * Mô hình liên ngành (Batch C).
 * Trọng tâm: thời gian **đã trôi qua** (không có SLA — điểm D1); CR37 — **ghi chú bắt buộc** khi yêu
 * cầu bổ sung / từ chối, **mã lý do tùy chọn**; CR26 — nhãn 4 trạng thái cột hàng đợi.
 */

function buoc(mau: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    code: 'HQ_TIEP_NHAN',
    name: 'Hải quan tiếp nhận',
    agencyCode: 'HQ',
    agencyName: 'Hải quan',
    order: 2,
    status: 'IN_PROGRESS',
    ...mau,
  };
}

function muc(mau: Partial<WorkflowChecklistItem> = {}): WorkflowChecklistItem {
  return { code: 'C1', label: 'Tiếp nhận hồ sơ', agencyCode: 'HQ', required: true, checked: false, ...mau };
}

describe('workflow.model — mô hình xử lý liên ngành', () => {
  // ---------------------------------------------------------------------------
  describe('formatElapsed — thời gian đã trôi qua (F26)', () => {
    it('dưới một phút thì tính theo giây', () => {
      expect(formatElapsed(0)).toBe('0 giây');
      expect(formatElapsed(59)).toBe('59 giây');
    });

    it('dưới một giờ thì tính theo phút', () => {
      expect(formatElapsed(60)).toBe('1 phút');
      expect(formatElapsed(3599)).toBe('59 phút');
    });

    it('dưới một ngày thì tính theo giờ và phút', () => {
      expect(formatElapsed(3600)).toBe('1 giờ 0 phút');
      expect(formatElapsed(4530)).toBe('1 giờ 15 phút');
    });

    it('từ một ngày trở lên thì tính theo ngày và giờ', () => {
      expect(formatElapsed(90000)).toBe('1 ngày 1 giờ');
    });

    it('giá trị thiếu hoặc âm vẫn trả chuỗi hợp lệ, không bao giờ là thời gian còn lại', () => {
      expect(formatElapsed(null)).toBe('0 giây');
      expect(formatElapsed(undefined)).toBe('0 giây');
      expect(formatElapsed(-120)).toBe('0 giây');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tab, mức ưu tiên và trạng thái bước', () => {
    it('chỉ chấp nhận đúng ba tab của SRS UI-06', () => {
      expect(isWorkflowQueueTab('todo')).toBe(true);
      expect(isWorkflowQueueTab('done')).toBe(true);
      expect(isWorkflowQueueTab('waiting')).toBe(true);
      expect(isWorkflowQueueTab('sla')).toBe(false);
      expect(isWorkflowQueueTab('')).toBe(false);
    });

    it('CR26 — cột "Trạng thái" hàng đợi có nhãn trạng thái khớp danh mục chuẩn', () => {
      expect(queueStateLabel('PROCESSING')).toBe('Đang xử lý nghiệp vụ');
      expect(queueStateLabel('COMPLETED')).toBe('Hoàn thành');
      expect(queueStateLabel('REVISION_REQUIRED')).toBe('Cần bổ sung');
      expect(queueStateLabel('NEED_SUPPLEMENT')).toBe('Cần bổ sung');
      expect(queueStateLabel('REJECTED')).toBe('Từ chối');
    });

    it('mã lạ do BE thêm mới vẫn hiển thị được thay vì vỡ giao diện', () => {
      expect(workflowStepStatusLabel('CHUA_CO')).toBe('CHUA_CO');
      expect(workflowStepStatusTone('CHUA_CO')).toBe('idle');
    });

    it('ánh xạ đúng nhãn và tông màu cho cả 5 mã thật của WorkflowStepStatus', () => {
      // Khớp enum BE: PENDING · IN_PROGRESS · WAITING_SUPPLEMENT · COMPLETED · REJECTED.
      expect(workflowStepStatusLabel('PENDING')).toBe('Chưa tiếp nhận');
      expect(workflowStepStatusTone('PENDING')).toBe('idle');
      expect(workflowStepStatusLabel('IN_PROGRESS')).toBe('Đang xử lý');
      expect(workflowStepStatusTone('IN_PROGRESS')).toBe('processing');
      expect(workflowStepStatusLabel('WAITING_SUPPLEMENT')).toBe('Chờ bổ sung');
      expect(workflowStepStatusTone('WAITING_SUPPLEMENT')).toBe('waiting');
      expect(workflowStepStatusLabel('COMPLETED')).toBe('Đã hoàn thành');
      expect(workflowStepStatusTone('COMPLETED')).toBe('done');
      expect(workflowStepStatusLabel('REJECTED')).toBe('Đã từ chối');
      expect(workflowStepStatusTone('REJECTED')).toBe('rejected');
    });

    it('mã bước chết cũ (APPROVED/PROCESSING/SKIPPED…) không còn được ánh xạ, rơi về chính mã', () => {
      expect(workflowStepStatusLabel('APPROVED')).toBe('APPROVED');
      expect(workflowStepStatusLabel('PROCESSING')).toBe('PROCESSING');
      expect(workflowStepStatusTone('SKIPPED')).toBe('idle');
    });
  });

  // ---------------------------------------------------------------------------
  describe('CR37 — ghi chú bắt buộc, mã lý do tùy chọn', () => {
    it('yêu cầu bổ sung và từ chối BẮT BUỘC ghi chú (nội dung lý do)', () => {
      expect(decisionRequiresReasonNote('REQUEST_SUPPLEMENT')).toBe(true);
      expect(decisionRequiresReasonNote('REJECT')).toBe(true);
    });

    it('xác nhận hoàn thành không bắt buộc ghi chú', () => {
      expect(decisionRequiresReasonNote('APPROVE')).toBe(false);
    });

    it('ô chọn mã lý do (tùy chọn) chỉ hiện với bổ sung/từ chối, lấy đúng nhóm danh mục', () => {
      expect(decisionShowsReasonCode('REQUEST_SUPPLEMENT')).toBe(true);
      expect(reasonScopeOf('REQUEST_SUPPLEMENT')).toBe('SUPPLEMENT');
      expect(decisionShowsReasonCode('REJECT')).toBe(true);
      expect(reasonScopeOf('REJECT')).toBe('REJECT');
      expect(decisionShowsReasonCode('APPROVE')).toBe(false);
      expect(reasonScopeOf('APPROVE')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('CR44 — isInspectionStep: nhận diện bước cụm nghiệp vụ song song', () => {
    ['BORDER_GUARD', 'CUSTOMS', 'QUARANTINE'].forEach((agencyCode) => {
      it(`bước không phải cổng của lực lượng ${agencyCode} là bước cụm`, () => {
        expect(isInspectionStep(buoc({ agencyCode, gate: null }))).toBe(true);
      });
    });

    it('bước cổng (gate != null) KHÔNG phải bước cụm, dù cùng lực lượng Biên phòng', () => {
      expect(isInspectionStep(buoc({ agencyCode: 'BORDER_GUARD', gate: 'ENTRY' }))).toBe(false);
      expect(isInspectionStep(buoc({ agencyCode: 'BORDER_GUARD', gate: 'EXIT' }))).toBe(false);
    });

    it('bước cổng nhận diện qua mã bước IMPORT_B1_ENTRY/IMPORT_B2_EXIT KHÔNG bao giờ bị tính là bước cụm kể cả khi thiếu cờ gate', () => {
      expect(isInspectionStep(buoc({ code: 'IMPORT_B1_ENTRY', agencyCode: 'BORDER_GUARD', gate: null }))).toBe(false);
      expect(isInspectionStep(buoc({ code: 'IMPORT_B2_EXIT', agencyCode: 'BORDER_GUARD', gate: null }))).toBe(false);
    });

    it('bước thu phí và bước khai báo không thuộc cụm nghiệp vụ', () => {
      expect(isInspectionStep(buoc({ agencyCode: 'FEE_COLLECTOR', gate: null }))).toBe(false);
      expect(isInspectionStep(buoc({ agencyCode: 'ENTERPRISE', gate: null }))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('CR2 — orderStepsForDisplay: dịch tễ đưa Kiểm dịch lên trước trong cụm', () => {
    const steps = [
      buoc({ code: 'ENTRY', agencyCode: 'BORDER_GUARD', order: 1, gate: 'ENTRY' }),
      buoc({ code: 'BORDER', agencyCode: 'BORDER_GUARD', order: 2, gate: null }),
      buoc({ code: 'QUAR', agencyCode: 'QUARANTINE', order: 3, gate: null }),
      buoc({ code: 'CUST', agencyCode: 'CUSTOMS', order: 4, gate: null }),
      buoc({ code: 'FEE', agencyCode: 'FEE_COLLECTOR', order: 5, gate: null }),
    ];

    it('không có cờ dịch tễ thì giữ nguyên thứ tự lộ trình', () => {
      expect(orderStepsForDisplay(steps, false).map((step) => step.code)).toEqual([
        'ENTRY',
        'BORDER',
        'QUAR',
        'CUST',
        'FEE',
      ]);
    });

    it('có cờ dịch tễ thì Kiểm dịch nhảy lên trước các bước nghiệp vụ khác trong cụm', () => {
      expect(orderStepsForDisplay(steps, true).map((step) => step.code)).toEqual([
        'ENTRY',
        'QUAR',
        'BORDER',
        'CUST',
        'FEE',
      ]);
    });

    it('chỉ đổi thứ tự HIỂN THỊ, không sửa mảng gốc và không đụng bước cổng/thu phí', () => {
      const original = steps.map((step) => step.code);
      const reordered = orderStepsForDisplay(steps, true);
      // Cổng vẫn đứng đầu, thu phí vẫn đứng cuối.
      expect(reordered[0].code).toBe('ENTRY');
      expect(reordered[reordered.length - 1].code).toBe('FEE');
      // Mảng gốc không bị sắp xếp tại chỗ.
      expect(steps.map((step) => step.code)).toEqual(original);
    });

    it('lộ trình không có bước cụm nào thì trả nguyên trạng dù có cờ dịch tễ', () => {
      const noInspection = [
        buoc({ code: 'ENTRY', agencyCode: 'BORDER_GUARD', order: 1, gate: 'ENTRY' }),
        buoc({ code: 'FEE', agencyCode: 'FEE_COLLECTOR', order: 2, gate: null }),
      ];
      expect(orderStepsForDisplay(noInspection, true).map((step) => step.code)).toEqual(['ENTRY', 'FEE']);
    });
  });

  // ---------------------------------------------------------------------------
  describe('buildChecklistColumns — 3 cột Biên phòng / Hải quan / Kiểm dịch', () => {
    const checklist = [
      muc({ code: 'HQ1', agencyCode: 'HQ' }),
      muc({ code: 'KD1', agencyCode: 'KD', label: 'Kiểm tra chứng thư' }),
      muc({ code: 'BP1', agencyCode: 'BP', label: 'Tiếp nhận hồ sơ' }),
      muc({ code: 'HQ2', agencyCode: 'HQ', label: 'Kiểm tra trị giá & thuế' }),
    ];
    const steps = [
      buoc({ code: 'BP_TIEP_NHAN', agencyCode: 'BP', agencyName: 'Biên phòng', order: 1, status: 'COMPLETED' }),
      buoc({ order: 2 }),
      buoc({ code: 'KD_KIEM_DICH', agencyCode: 'KD', agencyName: 'Kiểm dịch', order: 3, status: 'PENDING' }),
    ];

    it('gộp mục theo cơ quan và xếp cột theo thứ tự bước của quy trình', () => {
      const columns = buildChecklistColumns(checklist, steps);

      expect(columns.map((column) => column.agencyCode)).toEqual(['BP', 'HQ', 'KD']);
      expect(columns[1].items.map((item) => item.code)).toEqual(['HQ1', 'HQ2']);
      expect(columns[0].step?.code).toBe('BP_TIEP_NHAN');
    });

    it('lấy tên cơ quan từ bước; không có bước thì dùng nhãn dự phòng và xếp cuối', () => {
      const columns = buildChecklistColumns([...checklist, muc({ code: 'BH1', agencyCode: 'BAO_HIEM' })], steps);

      expect(columns[1].agencyName).toBe('Hải quan');
      expect(columns[columns.length - 1].agencyCode).toBe('BAO_HIEM');
      expect(columns[columns.length - 1].step).toBeNull();
    });

    it('checklist rỗng thì không dựng cột nào', () => {
      expect(buildChecklistColumns([], steps)).toEqual([]);
    });

    it('ưu tiên chọn bước kiểm tra nghiệp vụ (non-gate) thay vì bước xác nhận cổng khi cơ quan có cả 2 bước', () => {
      const checklistBP = [muc({ code: 'BP1', agencyCode: 'BORDER_GUARD', label: 'Tiếp nhận' })];
      const stepsBP = [
        buoc({ code: 'IMPORT_B1_ENTRY', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', order: 1, status: 'COMPLETED', gate: 'ENTRY' }),
        buoc({ code: 'IMPORT_BORDER', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', order: 2, status: 'IN_PROGRESS', gate: null }),
      ];
      const columns = buildChecklistColumns(checklistBP, stepsBP);
      expect(columns[0].step?.code).toBe('IMPORT_BORDER');
      expect(columns[0].step?.status).toBe('IN_PROGRESS');
    });
  });
});
