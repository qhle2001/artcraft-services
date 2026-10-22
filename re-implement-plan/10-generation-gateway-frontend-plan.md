# Plan 10: Frontend dùng API generation ArtCraft hiện hữu

## 1. Mục tiêu và phạm vi

Khôi phục frontend dùng model, tham số và job/media API ArtCraft gốc; backend chuyển execution qua generation service riêng theo Plan 07. Bỏ pricing/subscription/credit gate ArtCraft trên các tính năng AI self-host đã thống nhất.

```text
Frontend → backend ArtCraft tự host → generation service → GoClaw
Frontend → API job/media ArtCraft → gallery/history
```

- Chỉ sửa `frontend/`. Không sửa Rust, database, service hoặc cấu hình deploy backend.
- Phạm vi này là frontend ArtCraft. Frontend quản trị kết nối GoClaw/agent nằm trong repo generation service riêng, thuộc Plan 08; không đưa màn hình đó vào ArtCraft.
- Giữ layout, model picker, controls, gallery và luồng nhập liệu; chỉ khôi phục phần bị implementation GoClaw trước thay đổi hoặc sửa điểm nối bắt buộc.
- Không thêm Settings GoClaw, agent picker hoặc URL/token Gateway/GoClaw vào frontend.
- Không thay public API: path/method/request/response/default/limit, error envelope, job token, batch và polling giữ nguyên.
- Không mở PageScene generation, PageDraw inpaint web hoặc deprecated vốn chưa hoạt động. Desktop Tauri ở repo khác không thuộc task này.
- File source mới phải nằm dưới thư mục tên `re-implement`, ví dụ `frontend/apps/artcraft-webapp/src/re-implement/` hoặc `frontend/libs/api/src/lib/re-implement/`. Chỉ sửa file gốc ở điểm nối cần thiết.

## 2. Đầu vào và cách làm song song

- [Plan 07 — backend](07-generation-gateway-and-goclaw-reuse-plan.md): inventory đầy đủ tại mục 3/4, catalogue/cost API, job/media lifecycle và pricing policy server.
- [Plan 08 — service](08-generation-gateway-service-plan.md): service nội bộ và GoClaw; frontend không gọi API này.
- [Hướng dẫn 09](09-generation-gateway-backend-integration-guide.md): contract tích hợp và trình tự ghép; frontend chỉ dùng API ArtCraft hiện hữu.
- Baseline gốc: `storytold/artcraft-services` tại commit `e57ee3d63ac478a24149384bf1473ef97aa067f8`. Đối chiếu từng hunk với workspace, không reset/revert hàng loạt thay đổi khác.

Frontend và backend có thể bắt đầu song song vì contract public ArtCraft được giữ nguyên. Frontend dùng DTO/API sẵn có và đọc baseline, không cần chờ service chạy để viết caller. Không tự tạo schema giả định khi gặp điểm chưa rõ; ghi lại contract cần backend xác nhận trong bàn giao.

### Quyền sửa file

- **Agent Plan 10:** sở hữu mọi thay đổi trong `frontend/` của task này, kể cả shared API types/callers, host và pricing UI.
- **Agent Plan 07:** sở hữu backend/client/collector, MySQL/query/job enums, catalogue/cost handlers và adapter segmentation. Không sửa `frontend/`.
- **Agent Plan 08:** sở hữu contracts/service/executor/config service; không sửa frontend hoặc client/collector của Plan 07. Phân tách thư mục con trong `re-implement/generation-gateway/` theo hai plan.
- Hướng dẫn 09 là contract chung. Nếu cần sửa quy ước chung, thống nhất trước và để một task tích hợp cập nhật; không để mỗi agent tự sửa thành schema riêng.
- Với file root/manifest dùng chung ngoài phạm vi được giao, bàn giao thay đổi cho task sở hữu file; không cùng sửa khi chưa thống nhất.

## 3. Công việc frontend

### 3.1. Kiểm kê caller và implementation GoClaw trước đó

- Kiểm kê generation, model catalogue, cost estimate, job polling và gate credit/subscription trong webapp, shared libs và frontend website nếu có sử dụng cùng luồng.
- Phân biệt caller dùng API gốc, caller chuyển sang `/v1/omni_gen/generate/goclaw`, caller bypass backend và stub.
- Kiểm kê `generateGoClawMedia`, store/hook agent và controls từng bị ẩn. Chỉ gỡ phần không còn caller sau khi chuyển; giữ API host/storage/ownership fixes không liên quan.
- Ghi rõ lý do từng hunk frontend; không dọn lại toàn bộ giao diện.

### 3.2. Khôi phục model và tham số

- Create Image/Video/Audio dùng lại `get*Models()` và `generate*()` gốc thay endpoint GoClaw riêng.
- Khôi phục aspect ratio/resolution/quality/duration/batch và controls khác theo capability; không hardcode ẩn tất cả.
- Giữ model ID, enum, defaults, limits và ý nghĩa từng tham số. Không đổi model thành agent ID hoặc thêm trường service vào payload public.
- Giữ input media token và role như mask/reference/start frame/end frame/audio/video/character/multi-view khi caller hiện hữu hỗ trợ.
- Create Object/World, VFX và PageDraw dùng API hiện hữu; chỉ sửa caller nếu implementation trước hoặc lời gọi bypass thực sự yêu cầu.
- Giữ PageDraw inpaint web và PageScene generation ở trạng thái baseline chưa hỗ trợ. Không thêm UI hoặc nối tính năng mới.

### 3.3. Job, output và gallery

- Dùng response `inference_job_token`, `all_job_tokens` và polling job theo API gốc; không nhận Gateway request ID/manifest trong frontend.
- Giữ semantics batch/fan-out, pending/running/success/failure và cancel/dismiss hiện hữu. Submit thành công chưa phải generation hoàn tất.
- Dùng media pipeline/gallery/history sẵn có sau khi job hoàn tất; bỏ đường chỉ ghi output đồng bộ vào local batch store mà gallery không theo dõi.
- Giữ history/recreate/lightbox và prompt/context. Backend sở hữu import, prompt linkage và thumbnail; dữ liệu thiếu được bàn giao Plan 07, không giả metadata ở UI.
- Lỗi credential Gateway/GoClaw là lỗi server qua envelope ArtCraft, không mở modal subscription hoặc tự logout người dùng.

### 3.4. Bỏ pricing và credit gate

- Bỏ chặn generate bằng credit balance, subscription tier, upsell và purchase prompt trên luồng AI self-host, gồm PageDraw/VFX và shared adapters.
- Ẩn điểm vào pricing/credit/billing không dùng trong bản self-host; không viết lại account/auth hoặc xóa lịch sử billing.
- Gỡ cost request chỉ nhằm hiển thị giá nếu không còn consumer; nơi vẫn cần cost contract dùng schema cũ nhất quán với policy backend, không hardcode giá giả.
- Giữ auth, permission, ownership, validation, input limits và thông báo giới hạn concurrency/rate thực tế.
- Nếu có cùng cấu hình phục vụ hosted và self-host, giữ hành vi hosted ngoài phạm vi và tái sử dụng cơ chế cấu hình hiện hữu.

### 3.5. Host và lời gọi ra ngoài

- `StorytellerApiHostStore` tiếp tục trỏ tới backend ArtCraft tự host. Không thay host chung thành Gateway/GoClaw hoặc chỉnh lại cơ chế environment đã đúng.
- `SegmentationApi.ts` chuyển host về adapter backend do Plan 07 cung cấp; giữ `/segmentation/new_session`, `/segmentation/generate_masks`, method/payload/response gốc.
- Backend chịu trách nhiệm adapter/auth; frontend không tự gọi Gateway để bù adapter chưa có.
- Rà soát shared components/frontend website để không sót caller AI thuộc phạm vi đã chuyển gọi dịch vụ Storyteller cũ. Không thay domain hoặc link nội dung không liên quan hàng loạt.

## 4. Bàn giao và thứ tự ghép

### Bổ sung: Google login self-host

- Giữ Google login UI và luồng ID token → `UsersApi.GoogleSSO()` → `/v1/accounts/google_sso` trên backend ArtCraft. Không đổi API hoặc đưa login qua Gateway/GoClaw.
- `main.tsx` đã đọc `VITE_GOOGLE_CLIENT_ID`; dùng client ID OAuth do mình quản lý, không hardcode ID mới. Bổ sung/hướng dẫn cấu hình mẫu frontend nếu thiếu; file mới dưới `re-implement`.
- Client ID này phải nằm trong `GOOGLE_SIGN_IN_ALLOWED_AUDIENCES` của backend theo mục 7.6 Plan 07. Biến backend là cấu hình đề xuất cần implement; biến frontend đã tồn tại.
- Giữ API host self-host và cơ chế gửi/nhận session cookie. Không lưu ID token Google dài hạn hoặc thêm OAuth client secret vào bundle.
- Khi client ID thiếu hoặc đăng nhập lỗi, giữ xử lý lỗi phù hợp với UI hiện hữu; không chuyển sang client ID Storyteller hoặc báo thiếu subscription.
- Agent frontend sở hữu thay đổi trong `frontend/`; agent backend sở hữu verifier và compose/env backend. Việc đăng ký OAuth client/origin thuộc bước cấu hình vận hành trong hướng dẫn 09.

1. Lập danh sách caller, controls, pricing gate và file frontend cần sửa từ baseline/workspace.
2. Khôi phục catalogue/controls và generate/job/media flow; đối chiếu Object/World/VFX/PageDraw/shared callers.
3. Bỏ pricing gate/UI đã thống nhất; giữ auth/quyền truy cập.
4. Chuyển segmentation host khi adapter/path/auth đã được backend xác nhận.
5. Gỡ helper/store/hook GoClaw không còn dùng; rà soát imports/callers bằng đọc source.
6. Bàn giao diff, API đang dùng, Google client ID/origin cần cấu hình và dependency chưa sẵn sàng cho task tích hợp.

Backend bàn giao endpoint/capability mẫu, cost policy, job/error/batch semantics và host/path segmentation. Frontend bàn giao danh sách caller đã chuyển và gate đã bỏ. Public API không đổi; ví dụ bàn giao chỉ xác nhận contract hiện hữu.

Viết code có thể song song; nghiệm thu tích hợp phụ thuộc backend catalogue/job/media/segmentation sẵn sàng. Chỉ gỡ backend endpoint GoClaw cũ khi frontend và các caller khác chuyển xong; job tồn được xử lý theo hướng dẫn 09.

## 5. Tiêu chí hoàn tất

- [ ] Chỉ sửa frontend; source mới dưới `re-implement`.
- [ ] Google login dùng `VITE_GOOGLE_CLIENT_ID` của deployment, khớp audience backend; API và UI login giữ nguyên, không có client secret hoặc ID token lưu dài hạn trong browser.
- [ ] Image/video/audio dùng controls và generation/job API gốc; Object/World/VFX/PageDraw/shared callers được kiểm kê.
- [ ] Public request/response/default/limit/error/job/batch contract không đổi; không đưa DTO Gateway xuống UI.
- [ ] Không còn caller AI đã chuyển gọi endpoint GoClaw riêng hoặc dịch vụ Storyteller cũ.
- [ ] Không có token Gateway/GoClaw/provider trong bundle, browser storage hoặc request frontend.
- [ ] Không còn pricing/subscription/credit gate cản generation self-host; auth/permission vẫn giữ.
- [ ] Không redesign, agent picker, Settings GoClaw hoặc bật stub/deprecated ngoài phạm vi.
- [ ] Gallery/history/recreate và job failure/batch/cancel có checklist tích hợp; lỗi backend bàn giao Plan 07.
- [ ] Danh sách caller và thời điểm gỡ endpoint cũ được bàn giao.

**Ràng buộc hiện tại:** không chạy, build, test hoặc deploy repo. Checklist runtime là công việc tương lai sau khi có cho phép, không được ghi nhận đã đạt chỉ từ đọc source.
