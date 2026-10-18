import { exportAndLogFile, saveFileWithPicker } from './file-download.util';
import { of } from 'rxjs';

describe('saveFileWithPicker (SG-225)', () => {
  const blob = new Blob(['test content'], { type: 'text/csv' });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
  });

  it('khi showSaveFilePicker trả về handle hợp lệ -> lưu tệp và trả về SUCCESS', async () => {
    const mockWritable = {
      write: jasmine.createSpy('write').and.resolveTo(undefined),
      close: jasmine.createSpy('close').and.resolveTo(undefined),
    };
    const mockHandle = {
      createWritable: jasmine.createSpy('createWritable').and.resolveTo(mockWritable),
    };
    (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = jasmine.createSpy('showSaveFilePicker').and.resolveTo(mockHandle);

    const result = await saveFileWithPicker(blob, 'test.csv');

    expect(result).toBe('SUCCESS');
    expect(mockWritable.write).toHaveBeenCalledWith(blob);
    expect(mockWritable.close).toHaveBeenCalled();
  });

  it('khi người dùng nhấn Hủy/Thoát tại cửa sổ Save As (AbortError) -> bắt lỗi và trả về CANCELLED', async () => {
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = jasmine.createSpy('showSaveFilePicker').and.rejectWith(abortErr);

    const result = await saveFileWithPicker(blob, 'test.csv');

    expect(result).toBe('CANCELLED');
  });

  it('khi showSaveFilePicker gặp lỗi hệ thống (SecurityError...) -> trả về FAILED', async () => {
    const sysErr = new Error('SecurityError');
    sysErr.name = 'SecurityError';
    (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = jasmine.createSpy('showSaveFilePicker').and.rejectWith(sysErr);

    const result = await saveFileWithPicker(blob, 'test.csv');

    expect(result).toBe('FAILED');
  });

  it('khi showSaveFilePicker không khả dụng -> fallback tải qua thẻ <a> và trả về SUCCESS', async () => {
    delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake-url');
    spyOn(URL, 'revokeObjectURL');
    const fakeAnchor = document.createElement('a');
    spyOn(fakeAnchor, 'click');
    spyOn(document, 'createElement').and.returnValue(fakeAnchor);

    const result = await saveFileWithPicker(blob, 'test.csv');

    expect(result).toBe('SUCCESS');
    expect(fakeAnchor.click).toHaveBeenCalled();
  });

  describe('exportAndLogFile', () => {
    let mockApi: any;

    beforeEach(() => {
      mockApi = {
        logExportResult: jasmine.createSpy('logExportResult').and.returnValue({ subscribe: jasmine.createSpy('subscribe') }),
      };
    });

    it('khi lưu tệp thành công -> logExportResult gửi result SUCCESS', async () => {
      delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
      spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
      spyOn(URL, 'revokeObjectURL');

      const res = await exportAndLogFile(
        of(blob),
        'test.csv',
        mockApi,
        { targetType: 'AUDIT_LOG', targetId: 'audit-logs', reportName: 'Nhật ký thao tác' },
      );

      expect(res).toBe('SUCCESS');
      expect(mockApi.logExportResult).toHaveBeenCalledWith({
        action: undefined,
        targetType: 'AUDIT_LOG',
        targetId: 'audit-logs',
        result: 'SUCCESS',
        reportName: 'Nhật ký thao tác',
        filter: undefined,
      });
    });

    it('khi người dùng hủy (CANCELLED) -> gọi onCancel và logExportResult gửi result CANCELLED', async () => {
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = jasmine.createSpy('showSaveFilePicker').and.rejectWith(abortErr);
      const onCancelSpy = jasmine.createSpy('onCancel');

      const res = await exportAndLogFile(
        of(blob),
        'test.csv',
        mockApi,
        { targetType: 'REPORT', targetId: 'gate-event', reportName: 'Báo cáo' },
        onCancelSpy,
      );

      expect(res).toBe('CANCELLED');
      expect(onCancelSpy).toHaveBeenCalled();
      expect(mockApi.logExportResult).toHaveBeenCalledWith(jasmine.objectContaining({ result: 'CANCELLED' }));
    });
  });
});
