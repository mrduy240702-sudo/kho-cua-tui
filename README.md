# Kho của tui

Ứng dụng lưu trữ cá nhân ưu tiên trải nghiệm trên iPhone, với giao diện tối và định hướng offline-first.

## Công nghệ

- HTML, CSS và JavaScript thuần.
- IndexedDB lưu metadata, tệp gốc và thumbnail cục bộ.
- Progressive Web App (PWA) với Service Worker.
- Không cần máy chủ ứng dụng để chạy các chức năng lưu trữ cơ bản.

## Đã triển khai

- Tạo không gian lưu trữ và các nhóm độc lập.
- Nhập nhiều ảnh từ thiết bị vào nhóm Ảnh.
- Lưu nguyên Blob của tệp ảnh gốc, không nén hoặc chuyển đổi tệp gốc.
- Tạo thumbnail JPEG riêng để hiển thị lưới nhẹ hơn.
- Hiển thị ảnh theo từng đợt tối đa 90 ảnh.
- Xem ảnh toàn màn hình, chuyển ảnh bằng nút hoặc vuốt và tải ảnh xuống.
- Thống kê số ảnh đã lưu.

## Giới hạn cần biết

- Dữ liệu được lưu trong vùng lưu trữ của trình duyệt trên thiết bị. Xóa dữ liệu website, gỡ dữ liệu Safari hoặc chính sách hệ điều hành/trình duyệt có thể làm mất dữ liệu. Cần bổ sung và kiểm thử chức năng sao lưu/khôi phục trước khi lưu trữ nội dung quan trọng.
- Việc hiển thị một số định dạng ảnh phụ thuộc vào khả năng giải mã của Safari/iOS. Tệp gốc vẫn được lưu dưới dạng Blob nếu trình duyệt cho phép nhập, kể cả khi không tạo được thumbnail.
- Dung lượng IndexedDB có giới hạn và khác nhau theo thiết bị/trình duyệt.
- PWA cần được triển khai qua HTTPS để dùng đầy đủ Service Worker.

## Chạy thử

Có thể chạy bằng máy chủ web tĩnh trong quá trình phát triển. Trên iPhone, mở địa chỉ HTTPS bằng Safari để thử nghiệm.