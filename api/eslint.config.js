// @ts-check
const eslint = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');

/**
 * Cấu hình ESLint 9 (flat config) cho API SmartGate.
 *
 * Ưu tiên khi chọn quy tắc — mã nguồn này chưa từng được lint dòng nào, nên bộ quy tắc được
 * chọn theo tiêu chí "bắt lỗi thật", không phải "theo mặc định cho đủ bộ":
 *
 * 1. **Hàng rào kiến trúc** (mục cuối tệp) — đây là thứ đáng giá nhất với dự án:
 *    clean architecture 4 tầng chỉ có giá trị khi chiều phụ thuộc được ép ở công cụ, chứ không
 *    trông vào việc người viết nhớ quy ước. Hôm nay mã nguồn đang sạch chiều nhập khẩu, nên các
 *    quy tắc này đóng vai trò **chống hồi quy**.
 * 2. **Quy tắc cần thông tin kiểu** (`recommendedTypeChecked`) — `no-floating-promises`,
 *    `await-thenable`, `no-misused-promises` bắt được lớp lỗi mà `tsc` và jest đều không thấy:
 *    promise bị bỏ rơi trong use-case async thì lỗi ghi audit/thông báo sẽ biến mất im lặng.
 * 3. Các quy tắc gây ồn mà không mang giá trị cho dự án này thì **tắt kèm lý do** ngay tại chỗ.
 */
module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      // Script vận hành thuần Node (check-migrations / check-boot / check-storage): không nằm
      // trong tsconfig, không dùng lại ở runtime app — lint chúng chỉ tạo ồn.
      'scripts/**/*.js',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // ---- Nguồn kiểu cho các quy tắc type-aware -------------------------------------------------
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: globals.node,
    },
  },

  // Tệp cấu hình JS ở gốc (eslint.config.js, jest.config.js) không nằm trong tsconfig nên phải
  // tắt lớp quy tắc cần kiểu, nếu không parser sẽ báo "file not included in project".
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ---- Điều chỉnh cho NestJS + TypeORM -------------------------------------------------------
  {
    files: ['**/*.ts'],
    rules: {
      // Biến/tham số không dùng là dấu hiệu khá tin cậy của refactor bỏ dở hoặc gọi sai hàm.
      // Giữ ở mức "error" nhưng cho phép quy ước gạch dưới để chừa chỗ cho tham số bắt buộc
      // theo chữ ký (ví dụ `(_req, res)` của Express) và biến bỏ đi khi destructure.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Promise bị bỏ rơi = lỗi ghi audit / gửi thông báo biến mất không dấu vết. Đây là lý do
      // chính để bật lint type-aware.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      // `==` với null/undefined là mẫu hợp lệ và dùng có chủ đích; các so sánh lỏng khác thì cấm.
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // Mã chạy thật (ngoài `*.spec.ts`) hiện **không có `any` tường minh nào** — đã đo. Vì vậy để
      // ở mức "error" không tốn công sửa gì mà giữ được nguyên trạng: mọi `any` mới phải là quyết
      // định có ý thức, kèm `eslint-disable` giải thích, chứ không lọt vào âm thầm.
      '@typescript-eslint/no-explicit-any': 'error',

      // TẮT — `no-unsafe-*` (argument/assignment/call/member-access/return) báo mỗi lần chạm vào
      // giá trị `any` đến từ **thư viện bên thứ ba**: `QueryRunner.query()` của TypeORM trả `any`,
      // `request.user` của Express là `any`, `JSON.parse` trả `any`. Trên mã nguồn này chúng sinh
      // hàng trăm cảnh báo mà không chỉ ra được lỗi nào có thật, và cách "sửa" duy nhất là rải
      // ép kiểu khắp tầng infrastructure. Ranh giới kiểu thật sự đã được `no-explicit-any` +
      // `strict: true` của tsc canh.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // TẮT — `no-unsafe-enum-comparison`. 43 lần vi phạm và **không lần nào là lỗi**: chúng đều
      // nằm ở ranh giới với dữ liệu không có kiểu, nơi việc so `string` với enum là cố ý:
      //   · `declarations.status` là `varchar(32)` chứ không phải enum PostgreSQL (xem CLAUDE.md,
      //     migration P3), nên dòng SQL thô trong `database/migrations/support/*` mang kiểu `string`;
      //   · mã bước lấy từ bảng `workflow_step_roles` là `string`, so với `WorkflowStepCode`;
      //   · `HttpStatus` của NestJS là enum số, còn `exception.getStatus()` trả `number` —
      //     `status >= HttpStatus.INTERNAL_SERVER_ERROR` là mã đúng và không viết khác được.
      // Muốn "sửa" thì phải rải ép kiểu khắp nơi hoặc đổi kiểu ở ranh giới lưu trữ — diff lớn,
      // rủi ro cao, không bắt được lỗi nào.
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',

      // TẮT — `no-extraneous-class`: các lớp catalog tĩnh (`permission.catalog`, `role.catalog`)
      // và một số service chỉ gom hàm thuần là cố ý; đổi sang hàm rời sẽ phá cấu trúc module.
      '@typescript-eslint/no-extraneous-class': 'off',

      // TẮT — `no-empty-function`: constructor rỗng `constructor(...) {}` là **cú pháp bắt buộc**
      // của tiêm phụ thuộc qua tham số trong NestJS, xuất hiện ở mọi use-case và controller.
      '@typescript-eslint/no-empty-function': 'off',

      // Lỗi logic thật: gán biến trong điều kiện, `case` rơi xuống nhau, so sánh tự thân.
      'no-cond-assign': ['error', 'always'],
      'no-fallthrough': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-constructor-return': 'error',
      'no-promise-executor-return': 'error',

      // Hệ thống này là một **máy trạng thái**: thêm một giá trị vào `WorkflowDecision`,
      // `DeclarationStatus` hay `ReportCode` mà quên một nhánh `switch` thì hồ sơ đi sai luồng
      // trong im lặng. Quy tắc này bắt đúng chuyện đó.
      //
      // `considerDefaultExhaustiveForUnions: true` — `switch` **có** `default` được coi là đã phủ
      // hết. Cố ý: `DecideWorkflowStepUseCase.toException` gom 5 loại vi phạm thứ tự bước vào một
      // `default` trả 409, kèm chú thích giải thích; ép liệt kê lại 5 nhánh giống hệt nhau chỉ làm
      // mã dài hơn. Phần có giá trị — `switch` **không có** `default` mà thiếu nhánh — vẫn bị bắt.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { allowDefaultCaseForExhaustiveSwitch: true, considerDefaultExhaustiveForUnions: true },
      ],

      // `console.log` sót lại sau khi gỡ lỗi. Cũng đang ở mức 0 nên đặt "error" là miễn phí;
      // `console.warn/error` vẫn cho phép vì được dùng có chủ đích ở tầng khởi động.
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // HÀNG RÀO: chuỗi hiển thị tiếng Việt KHÔNG được dùng làm logic. Trước đây có `forceKeyForSlug`
      // dò `action.includes('thuế')` để chọn lực lượng (client gửi action qua URL → chèn được), và
      // `statusForStep` dò `step.includes('Hoàn')` để đặt trạng thái. Với đa ngữ, so khớp như vậy còn
      // vỡ ngay khi API trả tiếng Anh. Quy tắc chặn `.includes()/.startsWith()/.endsWith()` và `===/!==`
      // trên literal chứa ký tự có dấu tiếng Việt. Định danh phải là mã ASCII trong tập đóng; nhãn
      // dịch qua i18n. Từ điển `locales/*` được miễn (chính chúng chứa chuỗi tiếng Việt).
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
    files: ['src/common/i18n/locales/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // ---- Test và fixture: nới lỏng có kiểm soát ------------------------------------------------
  {
    files: ['**/*.spec.ts', '**/testing/**/*.ts'],
    rules: {
      // Dữ liệu giả lập phải nói dối về kiểu để dựng đúng tình huống cần thử (hồ sơ thiếu trường,
      // trạng thái không thể xảy ra qua API…). Hiện **chưa spec nào dùng tới** — đây là khoản nới
      // trước cho `any` trong fixture, để không ai phải chọn giữa "test đúng cái cần test" và
      // "lint xanh".
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',

      // 81 vi phạm `require-await` và 1 vi phạm `unbound-method` — đã đếm — đều nằm ở đây và đều
      // đúng: repository giả cài `async findById() { return this.rows.get(id) ?? null; }` để khớp
      // chữ ký `Promise<T>` của port mà bên trong không cần `await` cái gì, còn `expect(obj.method)`
      // là cách jest kiểm một phương thức có được gọi hay không. Cả hai đều không nói gì về chất
      // lượng mã chạy thật, nên tắt ở phạm vi test thay vì sửa 82 chỗ cho vừa lòng lint.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',

      // Test ĐƯỢC PHÉP khớp chuỗi tiếng Việt: kiểm tra thông báo/giao diện hiện đúng lời văn là
      // đúng việc của test. Hàng rào chỉ nhắm mã chạy thật — nơi chuỗi hiển thị bị dùng làm logic.
      'no-restricted-syntax': 'off',
    },
  },

  // ---- Hàng rào kiến trúc clean architecture -------------------------------------------------
  //
  // Chiều phụ thuộc chỉ được hướng vào trong:
  //     presentation ──▶ application ──▶ domain ◀── infrastructure
  //
  // Ngoại lệ duy nhất là `*.module.ts` — đó là **composition root** của Nest, nơi bắt buộc phải
  // biết cả lớp hiện thực (infrastructure) lẫn controller (presentation) để nối chúng với nhau.
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/presentation/**', '**/application/**'],
              message:
                'domain/ là tầng trong cùng: không được nhập khẩu từ application/, infrastructure/ hay presentation/.',
            },
            {
              group: ['@nestjs/*', '@nestjs/**', 'typeorm', 'typeorm/*', 'class-validator', 'class-transformer'],
              message:
                'domain/ phải là TypeScript thuần: không phụ thuộc NestJS, TypeORM hay class-validator (xem CLAUDE.md).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/*/application/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/presentation/**'],
              message:
                'application/ chỉ được phụ thuộc vào domain/ và các port của chính nó; lớp hiện thực được nối ở *.module.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/*/presentation/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**'],
              message:
                'presentation/ (controller) phải đi qua use-case ở application/, không được chạm thẳng vào repository/orm-entity.',
            },
          ],
        },
      ],
    },
  },
);
