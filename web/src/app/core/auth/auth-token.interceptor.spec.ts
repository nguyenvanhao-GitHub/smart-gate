import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AppMessageService } from '../services/app-message.service';
import { AccessProfile, MenuItem } from './access-control.model';
import { authTokenInterceptor } from './auth-token.interceptor';
import { AuthService } from './auth.service';
import { SESSION_STORAGE_KEY } from './session.storage';

/**
 * `auth-token.interceptor` là nơi duy nhất quyết định "khi nào người dùng bị đá ra khỏi phiên".
 * Sai một nhánh ở đây là mất dữ liệu đang nhập (401 của form đăng nhập) hoặc
 * đăng xuất oan người dùng chỉ vì thiếu quyền một thao tác (403).
 */

const API = environment.apiBaseUrl;
const TOKEN = 'token-gia-lap';

const MENU_MAU: MenuItem[] = [{ key: 'dossier', label: 'Hồ sơ', icon: 'description', route: '/declarations' }];

function hoSoTruyCap(): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'nguyenvana',
      displayName: 'Nguyễn Văn A',
      title: 'Chuyên viên',
      email: 'a@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: { id: 'org-1', code: 'CK-CK', name: 'Cửa khẩu Chiềng Khương' },
    },
    roles: [{ code: 'VAI_TRO_TEST', name: 'Vai trò thử nghiệm', dataScope: 'ORGANIZATION' }],
    permissions: ['dossier.view'],
    assignments: [],
    menu: MENU_MAU,
  };
}

@Component({ standalone: true, template: '' })
class TrangGiaComponent {}

const ROUTES: Routes = [
  { path: 'login', component: TrangGiaComponent },
  { path: 'declarations', component: TrangGiaComponent },
  { path: 'fees/tax', component: TrangGiaComponent },
];

describe('authTokenInterceptor — gắn token và xử lý 401/403', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: Router;
  let auth: AuthService;
  let messages: AppMessageService;

  /**
   * Cờ `signingOut` là biến cấp module nên sống xuyên suốt các test.
   * Đặt lại bằng đúng cơ chế của sản phẩm: một request `POST /auth/login`.
   */
  function datLaiCoDangXuat(): void {
    http.post(`${API}/auth/login`, {}).subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne(`${API}/auth/login`).flush({ accessToken: 'x', expiresIn: 3600, user: {} });
    messages.clear();
  }

  async function dungMoiTruong(url = '/declarations', coPhien = true, refreshToken?: string): Promise<void> {
    localStorage.clear();
    sessionStorage.clear();
    if (coPhien) {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ accessToken: TOKEN, refreshToken, profile: hoSoTruyCap() }),
      );
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter(ROUTES),
        provideLocationMocks(),
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    messages = TestBed.inject(AppMessageService);
    auth = TestBed.inject(AuthService);
    await router.navigateByUrl(url);
    datLaiCoDangXuat();
  }

  /** Gọi một API bất kỳ và giữ lại lỗi trả về cho phía gọi. */
  function goiApi(duongDan = `${API}/declarations`): { loi: HttpErrorResponse | null } {
    const ketQua = { loi: null as HttpErrorResponse | null };
    http.get(duongDan).subscribe({
      next: () => undefined,
      error: (error: HttpErrorResponse) => (ketQua.loi = error),
    });
    return ketQua;
  }

  function traLoi(duongDan: string, status: number): void {
    httpMock.expectOne(duongDan).flush({ message: 'loi' }, { status, statusText: status === 401 ? 'Unauthorized' : 'Forbidden' });
  }

  function noiDungThongBao(): string[] {
    return messages.messages().map((item) => item.text);
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Gắn Authorization', () => {
    it('gắn Bearer token vào request khi đã có phiên', async () => {
      await dungMoiTruong();
      goiApi();
      const request = httpMock.expectOne(`${API}/declarations`);
      expect(request.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
      request.flush({ items: [] });
    });

    it('không gắn header khi chưa đăng nhập', async () => {
      await dungMoiTruong('/login', false);
      goiApi();
      const request = httpMock.expectOne(`${API}/declarations`);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ items: [] });
    });

    it('không ghi đè Authorization do lời gọi tự đặt', async () => {
      await dungMoiTruong();
      http.get(`${API}/declarations`, { headers: { Authorization: 'Bearer rieng' } }).subscribe();
      const request = httpMock.expectOne(`${API}/declarations`);
      expect(request.request.headers.get('Authorization')).toBe('Bearer rieng');
      request.flush({ items: [] });
    });
  });

  // ---------------------------------------------------------------------------
  describe('401 — phiên hết hạn', () => {
    it('xóa phiên và điều hướng /login kèm returnUrl là trang đang đứng', async () => {
      await dungMoiTruong('/fees/tax');
      const navigate = spyOn(router, 'navigate');

      goiApi();
      traLoi(`${API}/declarations`, 401);

      expect(auth.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
      expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { returnUrl: '/fees/tax' } });
      expect(noiDungThongBao()).toEqual(['Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.']);
    });

    it('đang ở /login thì không gắn returnUrl=/login', async () => {
      await dungMoiTruong('/login');
      const navigate = spyOn(router, 'navigate');

      goiApi();
      traLoi(`${API}/declarations`, 401);

      expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: {} });
    });

    it('vẫn đẩy lỗi về cho phía gọi để trang tự xử lý', async () => {
      await dungMoiTruong();
      spyOn(router, 'navigate');

      const ketQua = goiApi();
      traLoi(`${API}/declarations`, 401);

      expect(ketQua.loi?.status).toBe(401);
    });

    it('hai request 401 song song chỉ điều hướng một lần và hiện một thông báo', async () => {
      await dungMoiTruong();
      const navigate = spyOn(router, 'navigate');

      goiApi(`${API}/declarations`);
      goiApi(`${API}/notifications/unread-count`);
      traLoi(`${API}/declarations`, 401);
      traLoi(`${API}/notifications/unread-count`, 401);

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(noiDungThongBao().length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('401 — tự động gia hạn ngầm (Silent Refresh) khi có Refresh Token', () => {
    it('request nghiệp vụ 401 tự động kích hoạt refresh token và retry thành công', async () => {
      await dungMoiTruong('/declarations', true, 'refresh-token-hop-le');
      const navigate = spyOn(router, 'navigate');

      let responseData: unknown = null;
      http.get(`${API}/declarations`).subscribe((res) => (responseData = res));

      // 1. Request nghiệp vụ gửi đi với token cũ
      const req1 = httpMock.expectOne(`${API}/declarations`);
      expect(req1.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);

      // Giả lập token cũ đã hết hạn -> trả 401
      req1.flush({ message: 'Token đã hết hạn' }, { status: 401, statusText: 'Unauthorized' });

      // 2. Interceptor tự động gửi request POST /auth/refresh với refreshToken
      const refreshReq = httpMock.expectOne(`${API}/auth/refresh`);
      expect(refreshReq.request.body).toEqual({ refreshToken: 'refresh-token-hop-le' });
      // Không gắn header Bearer token cũ đã hết hạn
      expect(refreshReq.request.headers.has('Authorization')).toBe(false);

      // Trả về cặp token mới
      refreshReq.flush({
        accessToken: 'access-token-moi',
        expiresIn: 3600,
        refreshToken: 'refresh-token-moi',
        refreshExpiresIn: 604800,
      });

      // 3. Interceptor tự động retry request ban đầu với accessToken mới
      const retryReq = httpMock.expectOne(`${API}/declarations`);
      expect(retryReq.request.headers.get('Authorization')).toBe('Bearer access-token-moi');
      expect(retryReq.request.headers.get('x-refreshed')).toBe('true');

      // Server trả về kết quả 200 OK cho request retry
      retryReq.flush({ items: [{ id: 1, title: 'Hồ sơ 1' }] });

      // Người dùng nhận dữ liệu bình thường, KHÔNG bị đăng xuất
      expect(responseData).toEqual({ items: [{ id: 1, title: 'Hồ sơ 1' }] });
      expect(navigate).not.toHaveBeenCalled();
      expect(noiDungThongBao()).toEqual([]);
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('nhiều request 401 đồng thời chỉ kích hoạt 1 lần refresh và cùng retry thành công', async () => {
      await dungMoiTruong('/declarations', true, 'refresh-token-hop-le');
      const navigate = spyOn(router, 'navigate');

      let res1: unknown = null;
      let res2: unknown = null;
      http.get(`${API}/declarations`).subscribe((res) => (res1 = res));
      http.get(`${API}/notifications/unread-count`).subscribe((res) => (res2 = res));

      // Cả 2 request ban đầu đều trả 401
      const req1 = httpMock.expectOne(`${API}/declarations`);
      const req2 = httpMock.expectOne(`${API}/notifications/unread-count`);
      req1.flush({ message: 'Hết hạn' }, { status: 401, statusText: 'Unauthorized' });
      req2.flush({ message: 'Hết hạn' }, { status: 401, statusText: 'Unauthorized' });

      // Chỉ có duy nhất 1 request /auth/refresh được gửi đi
      const refreshReq = httpMock.expectOne(`${API}/auth/refresh`);
      refreshReq.flush({
        accessToken: 'token-moi-toanh',
        expiresIn: 3600,
        refreshToken: 'refresh-moi-toanh',
      });

      // Cả 2 request đều được retry với token mới
      const retryReq1 = httpMock.expectOne(`${API}/declarations`);
      const retryReq2 = httpMock.expectOne(`${API}/notifications/unread-count`);
      expect(retryReq1.request.headers.get('Authorization')).toBe('Bearer token-moi-toanh');
      expect(retryReq2.request.headers.get('Authorization')).toBe('Bearer token-moi-toanh');

      retryReq1.flush({ items: [] });
      retryReq2.flush({ count: 5 });

      expect(res1).toEqual({ items: [] });
      expect(res2).toEqual({ count: 5 });
      expect(navigate).not.toHaveBeenCalled();
      expect(noiDungThongBao()).toEqual([]);
    });

    it('khi refresh token hết hạn (POST /auth/refresh trả 401) → đăng xuất và đưa về /login', async () => {
      await dungMoiTruong('/declarations', true, 'refresh-token-het-han');
      const navigate = spyOn(router, 'navigate');

      goiApi();
      const req1 = httpMock.expectOne(`${API}/declarations`);
      req1.flush({ message: 'Hết hạn' }, { status: 401, statusText: 'Unauthorized' });

      // Bị 401 ở /auth/refresh
      const refreshReq = httpMock.expectOne(`${API}/auth/refresh`);
      refreshReq.flush({ message: 'Refresh token đã hết hạn' }, { status: 401, statusText: 'Unauthorized' });

      expect(auth.isAuthenticated()).toBe(false);
      expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { returnUrl: '/declarations' } });
      expect(noiDungThongBao()).toEqual(['Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.']);
    });
  });

  // ---------------------------------------------------------------------------
  describe('401 của chính request đăng nhập', () => {
    it('sai mật khẩu thì KHÔNG điều hướng và KHÔNG xóa phiên', async () => {
      await dungMoiTruong();
      const navigate = spyOn(router, 'navigate');

      const ketQua = { loi: null as HttpErrorResponse | null };
      http.post(`${API}/auth/login`, { username: 'a', password: 'sai' }).subscribe({
        next: () => undefined,
        error: (error: HttpErrorResponse) => (ketQua.loi = error),
      });
      traLoi(`${API}/auth/login`, 401);

      expect(navigate).not.toHaveBeenCalled();
      expect(auth.isAuthenticated()).toBe(true);
      expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
      expect(noiDungThongBao()).toEqual([]);
      expect(ketQua.loi?.status).toBe(401);
    });

    it('đăng nhập lại rồi hết hạn lần nữa vẫn điều hướng được (cờ signingOut được đặt lại)', async () => {
      await dungMoiTruong();
      const navigate = spyOn(router, 'navigate');

      // Lần hết hạn thứ nhất.
      goiApi();
      traLoi(`${API}/declarations`, 401);
      expect(navigate).toHaveBeenCalledTimes(1);

      // Người dùng đăng nhập lại — request này đặt lại cờ.
      http.post(`${API}/auth/login`, { username: 'a', password: 'dung' }).subscribe();
      httpMock.expectOne(`${API}/auth/login`).flush({ accessToken: 'moi', expiresIn: 3600, user: {} });

      // Lần hết hạn thứ hai phải điều hướng tiếp, không được im lặng.
      goiApi();
      traLoi(`${API}/declarations`, 401);
      expect(navigate).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('403 — thiếu quyền, tuyệt đối không đăng xuất', () => {
    it('giữ nguyên phiên, giữ nguyên trang, chỉ hiện thông báo', async () => {
      await dungMoiTruong('/declarations');
      const navigate = spyOn(router, 'navigate');

      goiApi();
      traLoi(`${API}/declarations`, 403);

      expect(auth.isAuthenticated()).toBe(true);
      expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      expect(router.url).toBe('/declarations');
      expect(noiDungThongBao()).toEqual(['Bạn không có quyền thực hiện thao tác này.']);
    });

    it('nhiều 403 liên tiếp chỉ hiện một thông báo (chống trùng nội dung)', async () => {
      await dungMoiTruong();
      goiApi(`${API}/declarations`);
      goiApi(`${API}/reports/general`);
      traLoi(`${API}/declarations`, 403);
      traLoi(`${API}/reports/general`, 403);

      expect(noiDungThongBao().length).toBe(1);
    });

    it('403 không làm hỏng lần hết hạn 401 xảy ra sau đó', async () => {
      await dungMoiTruong();
      const navigate = spyOn(router, 'navigate');

      goiApi(`${API}/reports/general`);
      traLoi(`${API}/reports/general`, 403);
      expect(navigate).not.toHaveBeenCalled();

      goiApi(`${API}/declarations`);
      traLoi(`${API}/declarations`, 401);
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Các mã lỗi khác', () => {
    it('500 không đăng xuất và không tự hiện thông báo', async () => {
      await dungMoiTruong();
      const navigate = spyOn(router, 'navigate');

      const ketQua = goiApi();
      httpMock.expectOne(`${API}/declarations`).flush({}, { status: 500, statusText: 'Server Error' });

      expect(navigate).not.toHaveBeenCalled();
      expect(auth.isAuthenticated()).toBe(true);
      expect(noiDungThongBao()).toEqual([]);
      expect(ketQua.loi?.status).toBe(500);
    });

    it('request thành công không sinh thông báo nào', async () => {
      await dungMoiTruong();
      goiApi();
      httpMock.expectOne(`${API}/declarations`).flush({ items: [] });
      expect(noiDungThongBao()).toEqual([]);
    });
  });
});
