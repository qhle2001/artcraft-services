# Đối chiếu API wake GoClaw cho generation service

## 1. Nguồn và phạm vi xác minh

- Người dùng xác nhận self-host trực tiếp từ repo và yêu cầu dùng phiên bản mới nhất.
- Repo đối chiếu: `nextlevelbuilder/goclaw`, HEAD nhánh `main` trả về khi nghiên cứu: `549c81fd2406875be34cec3d7274125238e7d4a0`. Pin commit này cho các kết luận dưới đây; không đồng nhất với phiên bản đã deploy nếu chưa kiểm tra SHA của instance.
- Chỉ đọc source upstream và source client trong workspace. Không gọi wake, không chạy/build/test repo hoặc thực thi agent.
- Báo cáo tổng quan giữ mô tả service trung lập; chi tiết GoClaw chỉ thuộc tài liệu kỹ thuật này và các plan triển khai.

## 2. Kết luận chính: wake là lời gọi chờ kết quả

`POST /v1/agents/{id}/wake` gọi `loop.Run(...)` trực tiếp và chỉ ghi HTTP `200` sau khi hàm đó trả về. `Loop.Run` mô tả rõ nó block đến khi hoàn tất. Không có HTTP `202`/enqueue acknowledgement hoặc stream trong handler này.

Do đó service riêng cần tạo job ID bền vững và trả `202` cho ArtCraft trước; worker service mới giữ lời gọi wake chờ kết quả. ArtCraft collector poll service riêng, không mặc định poll một GoClaw generation job API.

```text
ArtCraft job token ↔ service job ID ↔ GoClaw run_id khi nhận được

ArtCraft → service: submit, nhận service job ID ngay sau persist
Worker service → GoClaw wake: chờ agent run trả về
GoClaw → worker: content + run_id + usage nếu có
Worker → validate/lưu artifact → cập nhật service job
ArtCraft collector → poll service → nhập media → hoàn tất ArtCraft job
```

`run_id` là mã một lần agent chạy, không phải service job ID. Wake tự tạo UUID phía server và chỉ trả nó trong response thành công; request không có trường cho caller ấn định run ID. HTTP lỗi của handler không bảo đảm trả run ID.

Nguồn: [wake handler](https://github.com/nextlevelbuilder/goclaw/blob/549c81fd2406875be34cec3d7274125238e7d4a0/internal/http/wake.go), [Loop.Run](https://github.com/nextlevelbuilder/goclaw/blob/549c81fd2406875be34cec3d7274125238e7d4a0/internal/agent/loop_run.go).

## 3. Request, response và quyền truy cập

Request body trong source:

```json
{
  "message": "<nội dung yêu cầu theo protocol agent/tool đã thống nhất>",
  "session_key": "<session riêng đã persist cho execution attempt>",
  "user_id": "<identity service được phép sử dụng>",
  "metadata": {}
}
```

- `message` bắt buộc; body handler giới hạn 1 MiB. Các giới hạn input/model/tool khác còn có thể áp dụng phía agent.
- `session_key` optional; nếu thiếu GoClaw tự tạo session ngẫu nhiên. Service nên persist session riêng cùng agent/tenant/user/attempt trước khi gửi để đối soát và tránh trộn ngữ cảnh giữa job.
- `session_key` là khóa hội thoại, **không phải idempotency key**. Gửi wake lần hai cùng session không được handler deduplicate.
- `metadata` có trong struct nhưng handler không chuyển `req.Metadata` vào `RunRequest`. Không dùng trường này để truyền model parameters hoặc làm cơ chế correlation đáng tin cậy.
- Không có top-level `model`, `parameters`, `inputs`, mask hoặc attachment trong wake DTO. Có thể serialize envelope vào `message`, nhưng GoClaw chỉ nhận nó là message; agent/tool cần protocol và validation thật để thực thi đúng model/tham số. Không suy ra native structured generation chỉ từ JSON trong message.
- Handler resolve authentication và yêu cầu role tối thiểu `operator`; token gateway/API key phải có quyền và tenant scope phù hợp. Không mặc định mọi bearer token đều có quyền wake.
- API key đã bind owner không được tự override identity bằng `user_id` trong body. Cần dùng identity/tenant đã cấu hình hợp lệ, không lấy user ID tùy ý từ frontend.

Response thành công có `content` dạng string, `run_id` và `usage` optional với token counts. Wake không trả structured `media`/artifact manifest, dù agent loop nội bộ có media results. HTTP `200` chứng minh handler đã nhận kết quả agent run, chưa chứng minh yêu cầu tạo đủ output media đã thành công.

Nguồn: [wake request/response và handler](https://github.com/nextlevelbuilder/goclaw/blob/549c81fd2406875be34cec3d7274125238e7d4a0/internal/http/wake.go), [auth](https://github.com/nextlevelbuilder/goclaw/blob/549c81fd2406875be34cec3d7274125238e7d4a0/internal/http/auth.go).

## 4. Kết quả media và API quan sát

- Agent finalization lưu `MediaRefs` trong assistant history; có thể nghiên cứu `GET /v1/chat/sessions/{key}/history/follow` để lấy media reference của đúng session/attempt và đúng user/tenant. Đây không tự trở thành manifest generation bảo đảm đủ role/batch/model.
- File endpoint có `GET /v1/media/{id}` và `GET /v1/files/{path...}`. Có bearer authentication hoặc signed file token `ft` tùy endpoint. Tải và lưu artifact về service trước khi báo succeeded; không chuyển bearer token sang host ngoài hoặc đưa secret xuống frontend.
- Chọn một protocol output cụ thể: agent/tool trả manifest có cấu trúc được validate, hoặc adapter đọc media refs đúng session/attempt rồi dựng manifest. Không lấy một link Markdown làm bằng chứng đủ output.
- Có `GET /v1/traces?session_key=...`, history follow và `GET /v1/runs/{runID}/timeline`. Timeline có thể trả `503` nếu store chưa được cấu hình, chịu phân quyền và pagination. Đây là API quan sát, không phải submit/status/cancel contract giống Fal.
- `run_id` chỉ nhận được sau wake thành công nên timeline không tự giải quyết trường hợp timeout trước khi nhận response. Trace/history chỉ hỗ trợ reconcile khi có dữ liệu và correlation được xác minh; không tìm thấy trace không chứng minh job chưa từng thực thi.
- Source OpenAPI tại commit này mô tả wake khá sơ lược và chưa liệt kê mọi route quan sát đang đăng ký. Khi có khác biệt, đối chiếu handler cùng version thực tế, không suy ra chức năng chỉ từ Swagger summary.

Nguồn: [history follow](https://github.com/nextlevelbuilder/goclaw/blob/549c81fd2406875be34cec3d7274125238e7d4a0/internal/http/sessions.go), [lưu media refs](https://github.com/nextlevelbuilder/goclaw/blob/549c81fd2406875be34cec3d7274125238e7d4a0/internal/agent/loop_finalize.go), [media](https://github.com/nextlevelbuilder/goclaw/blob/549c81fd2406875be34cec3d7274125238e7d4a0/internal/http/media_serve.go), [files](https://github.com/nextlevelbuilder/goclaw/blob/549c81fd2406875be34cec3d7274125238e7d4a0/internal/http/files.go), [traces/timeline](https://github.com/nextlevelbuilder/goclaw/blob/549c81fd2406875be34cec3d7274125238e7d4a0/internal/http/traces.go).

## 5. Timeout, retry và cancel

- Wake dùng HTTP request context khi gọi agent; client/proxy timeout hoặc disconnect có thể hủy context. Không có cam kết từ handler rằng mọi tool/provider bên ngoài đã rollback hoặc ngừng tạo media.
- Không có idempotency/cancel endpoint đi kèm trong wake handler. Không tự thêm giả định header `Idempotency-Key`, cùng session hoặc cùng message sẽ chống chạy trùng.
- Service persist attempt/session/request hash trước gửi. Khi mất response hoặc worker restart trong lúc wake, đánh dấu execution chưa rõ kết quả ở dữ liệu nội bộ và reconcile trước; không tự gọi wake lại. Public job contract vẫn theo hướng dẫn tích hợp, không tự thêm enum ra frontend.
- Chỉ retry khi biết lần trước chưa bắt đầu thực thi, hoặc có cơ chế dedup/reconcile đáng tin cậy ở tool/execution layer. Nếu chưa xác minh được, giữ chờ đối soát hoặc fail có kiểm soát; không hứa exactly-once từ wake.
- Cancel job còn queued có thể xử lý nội bộ service. Với job đang wake, đóng request chỉ là yêu cầu hủy; không báo tool đã dừng hoặc đã hoàn tài nguyên nếu chưa có xác nhận. Không coi cơ chế abort của WebSocket là mặc nhiên áp dụng cho wake.
- Timeout/concurrency/lease service phải tính theo thời gian wake thực tế; không giữ DB transaction hoặc request frontend mở suốt agent run.

## 6. Điểm cần sửa trong thiết kế/client

- Giữ ba định danh riêng: ArtCraft job token, Gateway job ID và optional GoClaw run ID theo từng attempt. Không yêu cầu persist GoClaw run ID trước wake vì API không cung cấp nó lúc submit.
- Client trong workspace `crates/api_clients/goclaw_client/src/lib.rs` hiện chỉ deserialize `content`, bỏ `run_id`/`usage`. Executor mới cần response typed đầy đủ và phân loại lỗi/timeout; thay đổi này chưa được implement trong lượt nghiên cứu.
- Client cũ chặn private IP và chỉ chấp nhận HTTPS public host; không dùng nguyên xi cho service DNS/private network nếu chưa bổ sung cấu hình trust/network phù hợp.
- Client cũ không nhận URL có query, trong khi GoClaw có signed file URL `?ft=...`; cần hỗ trợ có kiểm soát hoặc tải bằng bearer theo endpoint/path đã xác minh, không áp dụng parser cũ như một chuẩn API.
- Bổ sung bàn giao protocol tool/input/output theo từng modality. Wake không thay thế công việc xác minh model/capability và artifact manifest.

## 7. Các điều kiện phải chốt trước triển khai executor

- [ ] Pin SHA/version GoClaw deployment; đối chiếu handler và auth đúng version khi nâng cấp.
- [ ] Xác nhận agent/tenant/user và quyền operator của service credential.
- [ ] Chốt protocol request và output có validation, cách lấy media đúng session/attempt.
- [ ] Chốt policy cho mất response, restart và cancel mà không hứa chống trùng ngoài khả năng thực tế.
- [ ] Xác minh runtime sau khi được phép: wake thành công/lỗi/timeout, output thiếu, history/media access và tính bền vững sau restart.

Các mục runtime ở trên chưa được thực hiện. Nghiên cứu source không xác nhận mọi agent/tool trong instance đã hỗ trợ generation đúng yêu cầu.
