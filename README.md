# Smart Gate (Cửa Khẩu Thông Minh) - MVP v1.0

Hệ thống quản lý, phân luồng và giám sát cửa khẩu thông minh (Smart Gate Management System). Dự án được cấu trúc theo mô hình Monorepo gồm ứng dụng Backend API (NestJS) và Frontend Web (Angular).

---

## 🏗 Cấu Trúc Dự Án

```text
smart-gate-main/
├── .github/workflows/     # CI/CD tự động (GitHub Actions)
├── api/                   # Backend API (NestJS + TypeScript + TypeORM + PostgreSQL)
└── web/                   # Frontend Web (Angular 18 + Angular Material + ECharts)
```

---

## 🚀 Công Nghệ Sử Dụng

### Backend (`/api`)
- **Framework**: [NestJS](https://nestjs.com/) (Node.js 20+)
- **Ngôn ngữ**: TypeScript
- **Cơ sở dữ liệu**: PostgreSQL
- **ORM**: TypeORM (hỗ trợ database migration)
- **Tài liệu API**: Swagger / OpenAPI
- **Lưu trữ tệp**: Hỗ trợ S3 / MinIO protocol

### Frontend (`/web`)
- **Framework**: [Angular 18](https://angular.dev/)
- **UI Component**: Angular Material, CDK
- **Trực quan hoá biểu đồ**: Apache ECharts (`ngx-echarts`)
- **Quét mã**: `@zxing/browser`

---

## 🛠 Hướng Dẫn Cài Đặt & Chạy Dự Án

### 1. Yêu cầu môi trường
- **Node.js**: >= 20.x
- **NPM**: >= 10.x
- **PostgreSQL**: >= 14.x (hoặc chạy qua Docker)

---

### 2. Cài đặt Backend (`api`)

```bash
# 1. Di chuyển vào thư mục backend
cd api

# 2. Tạo file cấu hình môi trường từ mẫu
cp .env.example .env

# 3. Cập nhật thông tin kết nối DB trong .env (host, port, user, password)

# 4. Cài đặt dependencies
npm install

# 5. Chạy migration cơ sở dữ liệu
npm run migration:run

# 6. Khởi chạy server ở chế độ phát triển
npm run start:dev
```
- API sẽ chạy tại: `http://localhost:3000`
- Swagger Docs tại: `http://localhost:3000/api/docs`

---

### 3. Cài đặt Frontend (`web`)

```bash
# 1. Di chuyển vào thư mục frontend
cd web

# 2. Cài đặt dependencies
npm install

# 3. Khởi chạy ứng dụng
npm start
```
- Web App sẽ chạy tại: `http://localhost:4200`

---

## 🧪 Kiểm Thử (Testing)

### Backend
```bash
cd api
npm run test        # Chạy unit tests
npm run test:cov    # Báo cáo độ phủ test (Coverage)
npm run lint        # Kiểm tra code style
```

### Frontend
```bash
cd web
npm test            # Chạy unit test qua Karma
npm run lint        # Kiểm tra code style
```

---

## 🔒 Bảo Mật & Lưu Ý
- Tuyệt đối không commit file `.env` hoặc thông tin mật (database password, access key, private token) lên kho lưu trữ.
- Sử dụng file `.env.example` làm mẫu cấu hình khi triển khai môi trường mới.
