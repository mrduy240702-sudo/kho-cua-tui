# Kho của tui

Ứng dụng lưu trữ cá nhân ưu tiên trải nghiệm trên iPhone, với giao diện tối và định hướng offline-first.

## Công nghệ

- HTML, CSS và JavaScript thuần.
- IndexedDB cho dữ liệu ứng dụng lưu cục bộ.
- Progressive Web App (PWA) với Service Worker.
- Không cần máy chủ ứng dụng để chạy giao diện cơ bản.

## Chạy thử

Có thể mở bằng máy chủ web tĩnh trong quá trình phát triển. Khi triển khai, cần dùng HTTPS để hỗ trợ đầy đủ PWA và các API trình duyệt.

## Nguyên tắc dữ liệu

- Không tự ý nén hoặc chuyển đổi tệp gốc.
- Chỉ tạo thumbnail riêng khi triển khai thư viện ảnh.
- Tải nội dung theo nhu cầu để hạn chế sử dụng RAM.
- Kiểm tra giới hạn lưu trữ và quyền truy cập của từng trình duyệt.

## Trạng thái

Bản khung ban đầu: giao diện trang chủ, tạo không gian lưu trữ, lưu metadata không gian vào IndexedDB và thanh điều hướng. Các chức năng nhập ảnh/video, nhóm, trình xem, sao lưu và bảo mật chưa được triển khai.