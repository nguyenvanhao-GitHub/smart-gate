// @ts-check
const eslint = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Cấu hình ESLint 9 (flat config) cho Web SmartGate.
 *
 * Mã nguồn này chưa từng được lint dòng nào, nên bộ quy tắc chọn theo tiêu chí "bắt lỗi thật",
 * không phải "bật cho đủ bộ mặc định":
 *
 * 1. **Hàng rào kiến trúc** (mục cuối tệp) — quy ước sống còn của repo web là *mọi HTTP đi qua
 *    `core/services/api.service.ts`*. Đó là thứ duy nhất giữ cho contract FE↔BE tra được ở một chỗ;
 *    trông vào việc người viết nhớ quy ước thì sớm muộn cũng có component tự `inject(HttpClient)`.
 *    Hôm nay mã nguồn đang sạch — quy tắc này đóng vai trò **chống hồi quy**.
 * 2. **Quy tắc cần thông tin kiểu** (`recommendedTypeChecked`) — `no-floating-promises`,
 *    `no-misused-promises`, `await-thenable` bắt được lớp lỗi mà `tsc` và karma đều không thấy:
 *    một `firstValueFrom(...)` hay `router.navigate(...)` bị bỏ rơi thì lỗi mất im lặng.
 * 3. **Lint template** — toàn bộ giao diện dự án này viết **template inline trong `.ts`**
 *    (không có một tệp `.html` nào dưới `src/app`). Vì vậy `angular.processInlineTemplates` là
 *    bắt buộc: thiếu nó thì khối cấu hình template bên dưới không lint được dòng giao diện nào.
 * 4. Quy tắc gây ồn mà không mang giá trị cho dự án này thì **tắt kèm lý do** ngay tại chỗ.
 */
module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.angular/**'],
  },

  // ---- TypeScript ----------------------------------------------------------------------------
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...angular.configs.tsRecommended,
    ],
    // Bóc template inline trong `@Component({ template: \`...\` })` ra thành tệp ảo `.html`
    // để khối cấu hình template bên dưới lint được.
    processor: angular.processInlineTemplates,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: globals.browser,
    },
    rules: {
      // Hai tiền tố đang dùng, cả hai đều có lý do tồn tại: `sg` cho component dùng chung
      // (`sg-card`, `sg-alert`…) và `app` cho hai component khung — `app-root` bị `index.html`
      // gọi đích danh, `app-shell` là vỏ ứng dụng. Cấm `app` sẽ buộc đổi bootstrap mà chẳng
      // bắt được lỗi nào; điều quy tắc thật sự canh là component mới phải mang **một trong hai**
      // tiền tố, không đặt tên trần dễ đụng thẻ HTML.
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['sg', 'app'], style: 'kebab-case' },
      ],
      // Directive: bắt buộc selector kiểu thuộc tính camelCase, **cố ý không đòi tiền tố**.
      // `*hasPermission` là directive cấu trúc: tên selector phải trùng tên `@Input` thì cú pháp
      // `*hasPermission="'dossier.approve'"` mới chạy — ép thêm tiền tố `sg` sẽ đổi API template ở
      // hàng chục chỗ mà không bắt được lỗi nào.
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', style: 'camelCase' }],

      // Biến/tham số/import không dùng là dấu hiệu tin cậy của refactor bỏ dở — đặc biệt với các
      // trang một tệp dài vài trăm dòng ở `features/`, nơi import Material thừa không ai thấy.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Promise bị bỏ rơi = điều hướng/`firstValueFrom` thất bại trong im lặng. Lý do chính để
      // bật lint type-aware ở FE.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      // Mã chạy thật hiện **không có `any` tường minh nào** — đã đo. Để "error" là miễn phí mà giữ
      // được nguyên trạng: mọi `any` mới phải kèm `eslint-disable` giải thích.
      '@typescript-eslint/no-explicit-any': 'error',

      // TẮT — `no-unsafe-*`: báo mỗi khi chạm giá trị `any` đến từ **thư viện bên thứ ba**
      // (`EChartsOption` của echarts, `AbstractControl.value`, `HttpErrorResponse.error`,
      // `JSON.parse`). Trên mã nguồn này chúng sinh hàng trăm cảnh báo mà không chỉ ra lỗi thật;
      // ranh giới kiểu đã được `no-explicit-any` + `strict: true` + `strictTemplates` canh.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // `==` với null/undefined là mẫu hợp lệ và dùng có chủ đích; so sánh lỏng khác thì cấm.
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // Lỗi logic thật: gán trong điều kiện, `case` rơi xuống nhau, so sánh tự thân.
      'no-cond-assign': ['error', 'always'],
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-promise-executor-return': 'error',

      // Web là bên **hiển thị** máy trạng thái của API: thêm một `DeclarationStatus`,
      // `WorkflowDecision` hay `GateColor` mà quên một nhánh `switch` thì nhãn/màu hiển thị sai
      // trong im lặng. `default` được coi là đã phủ hết — nhiều hàm ánh xạ nhãn cố ý có nhánh
      // dự phòng; phần có giá trị (`switch` không `default` mà thiếu nhánh) vẫn bị bắt.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { allowDefaultCaseForExhaustiveSwitch: true, considerDefaultExhaustiveForUnions: true },
      ],

      // `console.log` sót lại sau khi gỡ lỗi — hiện đang ở mức 0, đặt "error" là miễn phí.
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // HÀNG RÀO: chuỗi hiển thị tiếng Việt KHÔNG được dùng làm logic. Trước đây `role-workbench`
      // dùng `primaryAction: 'Thêm xe không'` vừa làm nhãn vừa làm danh tính rồi dò
      // `action.includes('Phê duyệt')` để chọn icon/gọi API — đổi một chữ là đổi nghiệp vụ, và vỡ
      // ngay khi đổi ngôn ngữ. Định danh phải là mã ASCII trong tập đóng; nhãn tra qua i18n. Từ điển
      // `core/i18n/locales/*` được miễn.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(includes|startsWith|endsWith)$/] > Literal[value=/[À-ỹ]/]",
          message:
            'Không dùng chuỗi hiển thị tiếng Việt làm logic (so khớp con). Dùng mã định danh ASCII trong tập đóng; nhãn tra qua i18n.',
        },
        {
          selector: "BinaryExpression[operator=/^(===|!==)$/] > Literal[value=/[À-ỹ]/]",
          message:
            'Không so sánh bằng với chuỗi hiển thị tiếng Việt. Dùng mã định danh ASCII; nhãn tra qua i18n.',
        },
      ],
    },
  },

  // Từ điển ngôn ngữ được miễn hàng rào trên — chúng CHÍNH LÀ nơi chứa chuỗi tiếng Việt.
  {
    files: ['src/app/core/i18n/locales/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // Tệp cấu hình JS ở gốc (eslint.config.js, karma.conf.js) không nằm trong tsconfig nên phải tắt
  // lớp quy tắc cần kiểu, nếu không parser sẽ báo "file not included in project".
  {
    files: ['**/*.js'],
    extends: [eslint.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ---- Test: nới lỏng có kiểm soát -----------------------------------------------------------
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Dữ liệu giả lập phải nói dối về kiểu để dựng đúng tình huống cần thử (phản hồi API thiếu
      // trường, trạng thái không thể xảy ra qua giao diện).
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      // Stub trả `Promise` cho khớp chữ ký mà bên trong không `await` gì; `expect(obj.method)` là
      // cách jasmine kiểm một phương thức có được gọi hay không.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',

      // 24/25 vi phạm `no-unnecessary-type-assertion` của cả repo nằm ở đây và đều **không phải
      // lỗi**: các spec chọc vào thành viên `protected` qua cửa hậu
      // `component as unknown as Record<string, any>`, nên mọi thứ lấy ra đều là `any` và mọi ép
      // kiểu sau đó đều "thừa" dưới mắt quy tắc. Nhưng chính các ép kiểu ấy là thứ nói cho người
      // đọc biết dữ liệu giả lập đang đóng vai gì (`... as unknown as DashboardKpi`). Ở mã chạy
      // thật quy tắc vẫn bật — nơi ép kiểu thừa đúng là mã chết.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',

      // Test ĐƯỢC PHÉP khớp chuỗi tiếng Việt: kiểm giao diện hiện đúng lời văn là đúng việc của test.
      // Hàng rào chỉ nhắm mã chạy thật — nơi chuỗi hiển thị bị dùng làm logic.
      'no-restricted-syntax': 'off',
    },
  },

  // ---- Template Angular (kể cả template inline đã bóc ở trên) --------------------------------
  //
  // Bộ trợ năng (`templateAccessibility`) được bật **đầy đủ** và để ở mức "error", trừ hai quy tắc
  // hạ xuống "warn" ngay bên dưới. Đây là bộ đáng giá nhất với dự án: giao diện có bảng dữ liệu,
  // biểu đồ và rất nhiều nút chỉ có biểu tượng — `alt-text`, `valid-aria`, `elements-content`,
  // `role-has-required-aria` hiện đều xanh và giữ được như vậy là có ích thật.
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      // WARN, không phải error, và **không tắt**.
      //
      // 45/46 vi phạm trợ năng hiện tại là **cùng một khuôn duy nhất** — lớp nền của hộp thoại:
      //     <div class="backdrop" (click)="closeModal()">
      //       <section class="modal" (click)="$event.stopPropagation()">
      // Lớp nền là vùng "bấm ra ngoài để đóng", còn `stopPropagation` trên thân hộp thoại thậm chí
      // không phải hành vi gì cả; cả hai đều không phải widget nên gắn `tabindex` + `keydown` vào
      // chúng là **sai** chứ không phải sửa.
      //
      // Nhưng cảnh báo vẫn đúng ở một điểm có thật: các hộp thoại này **chưa đóng được bằng phím
      // Esc** (đã kiểm: chỉ `sg-search-input` và menu của shell có `keydown.escape`). Người dùng
      // bàn phím vẫn đóng được bằng nút "Đóng"/"Hủy", nên đây là thiếu sót về tiện dụng chứ không
      // phải ngõ cụt. Cách sửa đúng là bẫy tiêu điểm + `@HostListener('document:keydown.escape')`
      // cho từng trang có hộp thoại — một việc giao diện thật sự, không nên làm lén trong một lượt
      // dựng lint. Để "warn" để việc đó còn nhìn thấy được thay vì bị tắt đi rồi quên.
      '@angular-eslint/template/click-events-have-key-events': 'warn',
      '@angular-eslint/template/interactive-supports-focus': 'warn',
    },
  },

  // ---- Hàng rào kiến trúc: mọi HTTP đi qua ApiService -----------------------------------------
  //
  // Xem CLAUDE.md: "Toàn bộ HTTP đi qua api.service.ts — không gọi HttpClient trực tiếp trong
  // component". Những nơi được phép nhập khẩu `@angular/common/http` được liệt kê tường minh ở
  // khối ghi đè ngay bên dưới; mọi tệp còn lại bị chặn.
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/common/http', '@angular/common/http/*'],
              message:
                'Mọi lời gọi HTTP phải đi qua core/services/api.service.ts (xem CLAUDE.md). Thêm phương thức mới vào ApiService thay vì inject HttpClient tại đây.',
            },
          ],
        },
      ],
    },
  },
  {
    // Ngoại lệ có chủ đích:
    //  · `api.service.ts` — nơi duy nhất được cầm `HttpClient`.
    //  · `*.interceptor.ts` — interceptor buộc phải biết kiểu `HttpRequest`/`HttpErrorResponse`.
    //  · `main.ts` — composition root, nơi `provideHttpClient(withInterceptors(...))` được nối.
    //  · `*.spec.ts` — test cần `provideHttpClientTesting`/`HttpTestingController`.
    files: [
      'src/main.ts',
      'src/app/core/services/api.service.ts',
      'src/app/core/auth/*.interceptor.ts',
      'src/**/*.spec.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },
);
