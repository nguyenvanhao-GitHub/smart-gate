import { Injectable } from '@angular/core';

// =============================================================================
// Quét QR bằng camera trình duyệt (F34 — UI-09).
//
// Thư viện: **`@zxing/browser`** (đã được chủ dự án duyệt, đảo lại quyết định hoãn ở điểm C2).
// Nó bọc `@zxing/library` — bộ giải mã QR thuần JS, MIT, không cần WASM và không gọi mạng.
// Lý do chọn: `BarcodeDetector` của trình duyệt chưa có trên Firefox/Safari máy tính, còn các
// thư viện dựa trên WASM cần thêm tệp phụ phải tự phục vụ (khó với môi trường mạng nội bộ
// của cửa khẩu). Trả về `IScannerControls` nên **dừng được stream dứt điểm**.
//
// HAI ĐIỀU BẮT BUỘC ĐÚNG Ở TỆP NÀY:
//
// 1. **Nạp động.** `import('@zxing/browser')` chỉ chạy khi người dùng bấm bật camera, nên
//    esbuild tách thư viện thành chunk riêng — màn hình cổng không cõng nó lúc khởi động, và
//    máy trạm không có camera thì không bao giờ tải.
// 2. **Tắt được camera.** `stop()` gọi `IScannerControls.stop()` (dừng cả vòng giải mã lẫn
//    các track của MediaStream). Trang gọi nó ở `ngOnDestroy` và ngay sau khi quét trúng —
//    không để đèn camera sáng mãi.
//
// Camera cần **ngữ cảnh bảo mật** (HTTPS hoặc localhost): ở HTTP thường `navigator.mediaDevices`
// **không tồn tại**, nên phải kiểm trước chứ không thể trông vào việc bắt lỗi.
// =============================================================================

/** Vì sao không quét được — mã ASCII, nhãn do màn hình tra i18n. */
export type QrScannerFailure =
  | 'INSECURE_CONTEXT'
  | 'UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'NO_CAMERA'
  | 'START_FAILED';

export class QrScannerError extends Error {
  constructor(readonly reason: QrScannerFailure) {
    super(reason);
    this.name = 'QrScannerError';
  }
}

/** Phần duy nhất của `IScannerControls` mà dịch vụ này dùng tới. */
interface ScannerControls {
  stop(): void;
}

@Injectable({ providedIn: 'root' })
export class QrScannerService {
  private controls: ScannerControls | null = null;

  /**
   * Máy trạm này quét được không. Trả `null` nghĩa là được; ngược lại là lý do bị chặn.
   * Gọi trước khi vẽ nút để **không mời người dùng bấm một nút chắc chắn hỏng**.
   */
  supportCheck(): QrScannerFailure | null {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'UNSUPPORTED';
    if (!window.isSecureContext) return 'INSECURE_CONTEXT';
    if (!navigator.mediaDevices?.getUserMedia) return 'UNSUPPORTED';
    return null;
  }

  isRunning(): boolean {
    return !!this.controls;
  }

  /**
   * Mở camera sau (`facingMode: environment`) và giải mã liên tục vào `video`.
   * `onText` được gọi mỗi lần đọc được một chuỗi; khung hình không có mã thì thư viện báo lỗi
   * `NotFoundException` cho từng khung — **cố ý bỏ qua**, đó là trạng thái bình thường.
   */
  async start(video: HTMLVideoElement, onText: (text: string) => void): Promise<void> {
    const blocked = this.supportCheck();
    if (blocked) throw new QrScannerError(blocked);

    this.stop();
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader();
      this.controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        const text = result?.getText() ?? '';
        if (text) onText(text);
      });
    } catch (error: unknown) {
      this.stop();
      throw new QrScannerError(reasonOf(error));
    }
  }

  /** Dừng giải mã và tắt camera. Gọi nhiều lần vô hại. */
  stop(): void {
    const controls = this.controls;
    this.controls = null;
    try {
      controls?.stop();
    } catch {
      // Stream đã bị trình duyệt thu hồi trước đó — không có gì để dọn thêm.
    }
  }
}

/** Ánh xạ lỗi của `getUserMedia` sang lý do web hiểu được. */
function reasonOf(error: unknown): QrScannerFailure {
  const name = (error as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'PERMISSION_DENIED';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'NO_CAMERA';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'START_FAILED';
  return 'START_FAILED';
}
