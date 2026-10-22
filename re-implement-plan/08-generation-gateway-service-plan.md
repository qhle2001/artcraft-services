# Plan 08: Implement generation service riêng gọi GoClaw

## 1. Mục tiêu và phạm vi

Xây một service generation do mình quản lý, đóng vai trò nhận job/tham số model từ backend ArtCraft, thực thi qua GoClaw self-host và cung cấp trạng thái/output.

```text
Backend ArtCraft → generation_gateway_client → Generation Gateway
  → persistent queue → executor → GoClaw → agent/tool
  → artifact storage → backend/collector tải kết quả
```

Service được deploy độc lập; không phải code handler GoClaw đồng bộ ghép vào backend ArtCraft.

- **[Plan 07](07-generation-gateway-and-goclaw-reuse-plan.md):** client/router/job collector/import media nằm phía ArtCraft.
- **Plan này:** contracts, REST service, persistent job store, executor GoClaw, model registry, artifact storage và frontend quản trị đơn giản của service trong repo riêng.
- **[Hướng dẫn 09](09-generation-gateway-backend-integration-guide.md):** nguồn quy ước chung về contract/version, URL/token và cách tích hợp hai bên.

Service không sửa UI hay API public ArtCraft. Nó triển khai API nội bộ riêng; client/collector của plan 07 chuyển đổi dữ liệu để frontend tiếp tục dùng API ArtCraft gốc.

[Plan 10 — frontend](10-generation-gateway-frontend-plan.md) sở hữu thay đổi trong `frontend/` của repo ArtCraft. Frontend quản trị service nằm trong repo service riêng và thuộc Plan 08, không thuộc Plan 10. Agent service không sửa frontend ArtCraft hoặc client/collector thuộc Plan 07.

## 2. Phạm vi operation phải bao phủ

Inventory nguồn và đường gọi gốc nằm ở mục 3/4 của plan 07. Service cần một capability matrix cho tất cả nhóm:

- Ảnh: text-to-image, edit/reference, inpaint/mask, angle/zoom, background removal.
- Video: text/image/reference-to-video, start/end frame, audio/video/image/character reference, audio generation cùng video.
- Audio: music, remix, sounds, sample và điều khiển âm thanh theo khả năng thực thi.
- Mesh: text/image/multi-view/input mesh, geometry/texture/PBR, file phụ và cover.
- Splat/world: image/video/panorama, recaption policy và các định dạng world/splat.
- VFX/video editing: video nguồn, reference image, background/style và output video.
- Character: tạo, trạng thái và mapping ID/lifecycle cho video reference.
- Segmentation: session và mask generation có cấu trúc, không chỉ ảnh minh họa.
- Workflow AI legacy: face animation, lipsync, style transfer, studio/Comfy nếu có agent/tool thực thi tương đương.

Phân loại rõ supported/unsupported/disabled. Không coi chat agent là đã hỗ trợ mọi modality. TTS legacy đã tắt và chức năng frontend chưa nối không được quảng bá thành hoạt động. Conversion/render thuần media không tự chuyển qua AI.

## 3. Quyết định triển khai

- Service dự kiến dùng Rust/Actix, DTO có version và executor chạy độc lập hoặc cùng package nhưng tách vai trò vận hành.
- Persistent job store riêng cho Gateway, ưu tiên MySQL nếu dùng cùng stack hạ tầng; database/schema hoặc tài khoản truy cập tách khỏi dữ liệu user/wallet ArtCraft.
- Job store là nguồn sự thật; queue trong RAM chỉ là thông báo/tăng tốc, không phải nơi giữ job duy nhất.
- Artifact storage riêng bền vững, có TTL/retention đủ cho backend retry import.
- Polling status/artifact là giao thức ban đầu. Webhook chỉ bổ sung khi có nhu cầu, không giả payload Fal.
- Không gọi trực tiếp Fal/Kinovi/provider cũ để fallback khi GoClaw lỗi. GoClaw và tool đã cấu hình là đường thực thi AI.
- Không truy cập bảng users/wallet/media của ArtCraft hoặc nhận session cookie người dùng.

Service và frontend quản trị đặt trong repo riêng theo lựa chọn của người dùng, có lifecycle deploy độc lập với ArtCraft. Frontend ArtCraft không mang credential GoClaw; frontend quản trị chỉ cho người vận hành nhập/cập nhật credential qua API quản trị có xác thực, không giữ token để tự gọi GoClaw.

## 4. Contracts và REST API nội bộ

Triển khai đúng contract v1 ở mục 3 của hướng dẫn 09:

- `GET /v1/models`.
- `POST /v1/jobs`.
- `GET /v1/jobs/{request_id}`.
- `GET /v1/jobs/{request_id}/artifacts/{artifact_id}`.
- `POST /v1/jobs/{request_id}/cancel`.

Các path này thuộc service mới, không thay path API ArtCraft.

Contracts package thuộc plan service và được client của plan 07 dùng theo version cố định. Không khai báo lại một bộ DTO khác trong mỗi phía. Nếu nằm khác repo, phát hành schema/package/tag cùng version và contract examples.

Request phải giữ:

- Schema version, idempotency key, operation và model ID.
- Prompt/negative/style prompt theo đúng loại request.
- Typed parameters của từng operation.
- Input có role, URL hoặc uploaded artifact reference; không gộp các loại reference thành một chuỗi.
- Metadata đối chiếu ArtCraft job/correlation, không truyền secret người dùng.

Response phải có external request ID, trạng thái và artifact manifest khi hoàn tất. Chi tiết cụ thể và ví dụ thống nhất nằm ở hướng dẫn 09.

## 5. Model registry và cấu hình

Cấu hình được quản lý phía backend service. Giao diện quản trị cho phép thiết lập kết nối GoClaw và mapping agent; file/env giữ cấu hình triển khai và secret bootstrap, không còn là cách duy nhất cập nhật kết nối/agent.

Các cấu hình cần quản lý:

- Địa chỉ lắng nghe, authentication key của Gateway.
- URL/token GoClaw.
- Mapping `model + operation → agent/tool`.
- Supported parameters, default, range/enum/limit, input/output capability.
- Timeout, concurrency, retry, artifact retention.
- Địa chỉ/network tin cậy của GoClaw và nguồn media được phép.

Quy tắc:

1. Giữ model ID mà ArtCraft đang gửi nếu tool thực sự chạy đúng model đó. Không gắn nhãn model A nhưng âm thầm chạy model B.
2. `GET /v1/models` chỉ quảng bá cấu hình khả dụng. Model thiếu agent/tool hoặc secret cần thiết không được coi là ready.
3. Agent ID không phải model picker mới của frontend ArtCraft; người vận hành thiết lập mapping trong UI quản trị service, backend service lưu và áp dụng.
4. Validate config trước khi áp dụng; cập nhật sai giữ nguyên phiên bản hợp lệ đang dùng. Lưu cấu hình quản trị có revision trong database service làm nguồn chính; file mẫu chỉ dùng bootstrap/import có chủ đích, không tạo hai nguồn mapping cạnh tranh.
5. Job đã nhận giữ snapshot cấu hình/contract cần thiết để đổi config không đổi model giữa chừng.
6. Token không xuất hiện trong response/log/parser error. Config thật và secret file không commit; template dùng placeholder.
7. Cấu hình riêng cho dev/staging/production; không cho browser đọc file secret. Khóa mã hóa credential nằm trong secret/env phía server, tách khỏi database/config export.

### 5.1. Frontend quản trị đơn giản của service

Giao diện dành cho người vận hành service, tách khỏi frontend ArtCraft. Dự kiến một trang với hai phần:

- **Kết nối GoClaw:** URL, tenant/user scope khi cần, nhập/thay token, trạng thái đã cấu hình và nút kiểm tra kết nối. Backend thực hiện kiểm tra auth/quyền/liệt kê agent; không tự wake hoặc tạo generation tính phí chỉ vì bấm lưu.
- **Agent và model routing:** tải danh sách agent qua backend service, chọn agent hiện có và ánh xạ `model + operation → agent/tool`; bật/tắt mapping, xem capability/parameters và lỗi thiếu cấu hình. Cho phép nhập agent ID khi quyền liệt kê bị giới hạn nhưng vẫn phải xác minh quyền sử dụng/capability trước khi công bố ready.

Skills được cài đặt và quản lý trực tiếp tại GoClaw. Không xây trang upload/edit/sync skills hoặc copy skills về service. Mapping agent không tự chứng minh model/tool đã sẵn sàng; protocol input/output và capability vẫn phải được xác nhận như mục 6.

Luồng cấu hình: đăng nhập quản trị → nhập kết nối → backend kiểm tra → chọn agent/mapping → backend validate và lưu revision → áp dụng cho job mới. Job đang chạy giữ snapshot cấu hình đã nhận. Xử lý token rotation bằng credential reference/version theo policy server, không lưu token thô trong từng job.

### 5.2. API quản trị và credential

- Phục vụ frontend quản trị và API từ cùng origin nếu có thể. Dùng namespace riêng như `/admin/api/*`, tách với `/v1/models` và `/v1/jobs` mà ArtCraft gọi; không đổi public contract ArtCraft.
- Đăng nhập quản trị service bằng cơ chế tối giản có session phía server và cookie HttpOnly/Secure phù hợp. Credential quản trị bootstrap lấy từ secret/env; không dùng user database/session ArtCraft và không nhúng Gateway service-to-service token vào bundle.
- Bảo vệ mọi API đọc/sửa config bằng quyền admin; chống CSRF cho thao tác thay đổi nếu dùng cookie. Endpoint kiểm tra URL cũng phải tuân theo trust/allowlist đã cấu hình, không biến thành proxy tùy ý.
- Token GoClaw chỉ được gửi khi admin nhập/thay, qua kết nối HTTPS hoặc kênh nội bộ tin cậy. Frontend không persist token vào localStorage/sessionStorage; xóa giá trị nhập sau khi lưu thành công. API đọc config chỉ trả trạng thái `token_configured`, không trả lại token đã lưu.
- Backend service mã hóa credential lưu bền vững; không ghi token vào log, lỗi, audit payload hoặc config export. Lưu audit cấu hình ở mức người sửa/thời điểm/revision, loại trừ secret.
- UI lưu mapping và server reload cùng một nguồn cấu hình; lỗi kết nối/agent/token hiển thị rõ mà không ghi đè last known good config.

## 6. Giữ và thực thi tham số

Dùng danh mục tham số tại mục 6 plan 07 làm checklist, triển khai typed DTO và adapter cho từng operation.

- Default/limit phải tương thích ArtCraft; normalize có chủ đích và ghi nhận requested/effective parameters.
- Model-specific field không được drop khi chuyển qua client hoặc GoClaw.
- Nếu GoClaw native API chỉ nhận message, executor vẫn cần schema/tool input/output được validate. Mô tả bằng lời “hãy tạo 2 ảnh” không đủ đảm bảo batch count hay kích thước.
- Agent/tool phải nhận đúng ảnh gốc/mask/start/end frame/audio ref/multi-view/character.
- Output cần kiểm tra loại media, số lượng bắt buộc, kích thước/duration/format khi operation đòi hỏi; báo lỗi rõ nếu tool không làm được.
- Tham số không hỗ trợ bị reject trước khi nhận job hoặc bị capability công bố unavailable; không tự thay giá trị.
- Hint dùng cho cost estimate không được lẫn thành tham số thực thi.
- Không bắt ArtCraft đổi public schema để thuận tiện cho message format của GoClaw.

Đã đối chiếu wake tại HEAD `main` upstream `549c81fd2406875be34cec3d7274125238e7d4a0`; chi tiết nguồn và giới hạn nằm trong [nghiên cứu API wake](12-goclaw-wake-api-research.md). Wake là HTTP đồng bộ trả `content/run_id/usage` sau agent run, không phải API enqueue giống Fal; `metadata` không được handler truyền vào run và không có typed generation params/media manifest trong wake DTO. Protocol agent/tool và instance triển khai vẫn cần xác minh thực tế trước khi nghiệm thu.

## 7. Queue, executor và phục hồi

1. Authenticate backend caller, validate schema/capability/input.
2. Atomically tạo job bền vững theo idempotency key + request hash.
3. Trả `202 Accepted` ngay sau khi persist; không chờ GoClaw tạo xong.
4. Executor claim job bằng lease/lock, tuân thủ giới hạn concurrency.
5. Persist context/session/attempt/request hash trước wake. Gateway job ID được tạo trước; GoClaw `run_id` chỉ persist khi nhận được response hoặc reconcile có bằng chứng, không yêu cầu nó có sẵn trước submit.
6. Worker gọi wake đồng bộ tới đúng agent bằng protocol message/tool đã chốt. Gateway vẫn phục vụ status từ job store trong lúc worker chờ; không mặc định GoClaw có queue/status API tương đương Fal.
7. Thu artifact, validate, lưu bền vững và commit manifest/status.
8. Lease hết hạn, timeout hoặc process restart phải reconcile theo session/attempt và dữ liệu trace/history/tool nếu có. Wake không dedup theo session và không bảo đảm exactly-once; nếu chưa rõ lần trước đã thực thi hay chưa thì không tự submit lần hai, giữ trạng thái đối soát nội bộ hoặc fail có kiểm soát.
9. Persist attempt, deadline, error category và terminal state. Retry hữu hạn; operation không idempotent cần reconcile upstream trước khi retry.
10. Cancel best-effort: phân biệt cancel requested, cancel confirmed và tool không hỗ trợ cancel. Không báo đã dừng tài nguyên khi chưa có xác nhận.

Trạng thái service: `queued → running → succeeded | failed | cancelled`. Unknown/reconciling không được báo thành success. Progress chỉ công bố khi GoClaw/tool có dữ liệu thật.

## 8. Artifact và kết quả

Manifest có artifact ID, content type, media class, size, batch index, vai trò, checksum nếu có và thông số media cần thiết.

- Image batch giữ đầy đủ output và thứ tự.
- Audio multi-clip có nhóm/parent-child hoặc danh sách output rõ; không chỉ giữ clip đầu.
- Video giữ main file, audio và preview nếu executor có tạo; backend vẫn vận hành thumbnail pipeline của ArtCraft.
- Mesh có thể có GLB/OBJ/texture/archive/cover; giữ quan hệ giữa file và primary output.
- Splat/world giữ định dạng thực, cover/scene metadata liên quan.
- Segmentation trả mask/session data đúng semantics; character có stable service reference.
- Không dùng Markdown extraction hoặc một URL tự do do agent trả làm contract chính thức.
- Endpoint tải artifact có authentication. Artifact không trở thành public chỉ vì ai đó biết request ID.
- TTL/cleanup không được xóa output trước cửa sổ import/retry mà hướng dẫn 09 quy định.
- Có cleanup orphan/partial output; không complete khi thiếu output bắt buộc.
- Gateway success nghĩa là artifact đã sẵn sàng cho import, không có nghĩa job ArtCraft đã hoàn tất.

## 9. Network, bảo mật và vận hành

- Tách Gateway API token với GoClaw token. Chỉ service biết GoClaw token.
- Chấp nhận GoClaw private endpoint đã cấu hình/allowlist cho self-host; không cho caller tùy ý chọn host để truy cập mạng nội bộ.
- Validate input URL/redirect/size/MIME/path; không thực thi file/script do media hoặc agent tự cung cấp.
- Với HTTPS public dùng xác minh TLS; network nội bộ có kiểm soát thì khai báo trust policy cụ thể.
- Frontend ArtCraft không gọi service trực tiếp. Frontend quản trị service gọi API quản trị cùng origin; nếu deploy khác origin thì chỉ cho phép origin quản trị đã cấu hình, không mở CORS wildcard cho API/secret.
- Health/readiness, graceful shutdown và worker lease đủ để rollout không mất job.
- Structured log và metrics theo ArtCraft job/Gateway request/GoClaw task, không log secret.
- Back up job store/artifact/config; có retention và recovery rõ.
- Cấu hình service/executor độc lập; ArtCraft collector được deploy theo plan backend/hướng dẫn tích hợp.
- Không chạy service hoặc test trong lượt lập kế hoạch; nội dung này là thiết kế công việc tương lai.

## 10. Bố trí file thuộc plan service

```text
re-implement/generation-gateway/
  contracts/                       # DTO/schema nội bộ có version
  service/
    ...                            # REST, registry, persistent queue, executor
    ...                            # GoClaw adapter và artifact storage
    ...                            # Admin auth/API, cấu hình và mã hóa credential
  admin-web/
    ...                            # UI kết nối GoClaw và mapping agent/model
  config/
    ...                            # Config mẫu, schema và hướng dẫn secret
```

Có thể tách executor thành binary riêng trong service package. `client/` và `collector/` thuộc plan 07, không implement lặp ở đây.

Mọi source mới nằm dưới `re-implement`. Service riêng ở repo khác cũng dùng một thư mục `re-implement` cho source custom theo quy ước đã yêu cầu.

## 11. Thứ tự implement và đầu ra

1. Xác minh API/tool GoClaw thật; lập capability matrix toàn bộ nhóm tại mục 2.
2. Chốt contracts v1 với plan backend theo hướng dẫn 09; phát hành DTO/schema/examples dùng chung.
3. Implement config/model registry có revision, validation, mã hóa credential và bootstrap.
4. Implement authentication, persistent submit/idempotency/status/cancel.
5. Implement executor GoClaw và cơ chế task reconciliation.
6. Implement artifact persistence/manifest/download/retention.
7. Hoàn thiện adapter theo từng modality/operation; không chỉ hoàn tất ảnh.
8. Implement frontend quản trị và admin API/auth theo mục 5.1/5.2; đóng gói frontend cùng service, chuẩn bị config/runbook. Skills quản lý trực tiếp ở GoClaw.
9. Sau khi được phép mới kiểm chứng service và tích hợp với collector ArtCraft theo hướng dẫn 09.

## 12. Tiêu chí hoàn tất service

- [ ] API nội bộ và DTO đúng một version contract với client.
- [ ] Model/capability phản ánh tool thực sự hoạt động; mapping rõ từng operation.
- [ ] URL/token GoClaw chỉ ở service; không trả ra ArtCraft frontend.
- [ ] Params và role media không mất hoặc bị đổi âm thầm.
- [ ] Mọi execution AI của service đi qua GoClaw, không fallback provider cũ.
- [ ] Queue/job Gateway bền vững và submit idempotent; wake timeout/restart không bị retry mù. Chứng minh cơ chế tool dedup/reconcile nếu tuyên bố execution không trùng; không suy ra bảo đảm đó từ wake.
- [ ] Gateway response nhanh sau khi nhận job; status phản ánh trạng thái thật.
- [ ] Artifact đủ dạng/output/batch, có auth và tồn tại đủ lâu cho ArtCraft import.
- [ ] Unsupported/error/cancel/deadline có semantics rõ và parse được bằng client.
- [ ] Service không phụ thuộc bảng user/wallet/media nội bộ của ArtCraft.
- [ ] Có file config mẫu và hướng dẫn deploy/recovery riêng.
- [ ] Có UI quản trị riêng để cấu hình GoClaw và chọn/mapping agent; không sửa UI ArtCraft cho mục đích này.
- [ ] Admin auth/session và API bảo vệ config hoạt động; không trả token đã lưu xuống browser, không lưu token vào browser storage hoặc log.
- [ ] Cấu hình có revision/nguồn chính thống nhất; cập nhật không đổi mapping của job đang chạy và không tự kích hoạt wake khi lưu.
- [ ] Skills tiếp tục do GoClaw quản lý trực tiếp, không có skill editor/sync trong service.
- [ ] Mỗi operation trong inventory có kết quả supported/unsupported/disabled cụ thể.
- [ ] Kiểm chứng runtime chỉ thực hiện sau khi chủ repo cho phép.

Plan này chưa implement service. Ràng buộc không chạy/build/test repo hiện vẫn giữ nguyên.
