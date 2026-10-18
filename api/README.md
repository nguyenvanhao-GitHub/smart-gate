# Smart Gate - Backend API

Dịch vụ Backend API cho hệ thống Cửa Khẩu Thông Minh (Smart Gate).

## 🚀 Công Nghệ
- **NestJS** với kiến trúc phân tầng (Clean / Hexagonal Architecture)
- **PostgreSQL** & **TypeORM**
- **TypeScript** & **Jest**

## ⚙️ Thiết Lập
1. Cấu hình biến môi trường:
   ```bash
   cp .env.example .env
   ```
2. Cài đặt thư viện:
   ```bash
   npm install
   ```
3. Chạy migration:
   ```bash
   npm run migration:run
   ```
4. Khởi chạy:
   ```bash
   npm run start:dev
   ```
