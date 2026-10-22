# Plan 07: Chỉnh sửa backend ArtCraft để sử dụng generation service riêng

## 1. Mục tiêu và ranh giới trách nhiệm

Giữ API generation của ArtCraft và luồng model/tham số/job/media hiện có; thay tầng gọi provider bằng **client của mình → service của mình → GoClaw**.

Bộ tài liệu được tách thành ba plan triển khai và một hướng dẫn tích hợp:

- **Plan này:** chỉ code backend ArtCraft: router/provider adapter, HTTP client, query/job collector, import media, catalogue và self-host billing policy. Không sửa file trong `frontend/`.
- **[Plan 08 — implement service](08-generation-gateway-service-plan.md):** REST service riêng, contracts nội bộ, queue/job store, executor GoClaw, model-to-agent config và artifact storage.
- **[Hướng dẫn 09 — tích hợp](09-generation-gateway-backend-integration-guide.md):** contract chung, cấu hình URL/token/network, submit/status/artifact và trình tự nối hai bên.
- **[Plan 10 — frontend](10-generation-gateway-frontend-plan.md):** khôi phục caller/model controls/job polling, bỏ pricing gate và sửa điểm nối frontend bắt buộc; không sửa backend hoặc service.

Service được deploy độc lập với `storyteller-web`. Client là thư viện được biên dịch cùng ArtCraft, không phải một server khác. ArtCraft collector là worker phía ArtCraft để poll service và ghi kết quả vào database/storage ArtCraft; khác với executor phía service gọi GoClaw.

```text
Frontend → API ArtCraft giữ nguyên → router → client của mình
  → service riêng (plan 08) → GoClaw
ArtCraft collector → service riêng → import vào media/job ArtCraft
```

Plan backend có thể thực hiện dựa trên DTO và transport giả lập của contract tích hợp; không bắt service phải chạy trong lúc viết adapter. Chỉ kiểm chứng runtime sau khi được chủ repo cho phép.

### Ràng buộc bắt buộc: giữ API, hạn chế sửa UI

- Giữ nguyên API ArtCraft mà frontend và client hiện có đang sử dụng: URL path, HTTP method, request/response schema, tên trường, kiểu dữ liệu, default, giới hạn và cơ chế job/polling. Không thêm endpoint GoClaw/gateway để thay các endpoint generation public đang có; không yêu cầu caller chuyển API version.
- Chỉ thay tầng thực thi phía sau API: router → client của mình → service của mình → GoClaw. Service/client mới chịu trách nhiệm chuyển đổi request và kết quả để khớp contract ArtCraft hiện hữu.
- UI giữ layout, model picker, các điều khiển tham số, gallery và tương tác hiện có. Chỉ sửa điểm nối bắt buộc, khôi phục phần từng bị thay bởi luồng GoClaw riêng, và bỏ pricing/credit/subscription gate đã được yêu cầu.
- Không redesign, thêm agent picker, thêm màn hình Settings hoặc bật các chức năng vốn chưa hoạt động chỉ vì đổi service.
- Các API nội bộ giữa backend và service mới trong [hướng dẫn tích hợp](09-generation-gateway-backend-integration-guide.md) là contract mới của service riêng, không phải thay đổi API ArtCraft. Không đưa DTO/trạng thái nội bộ này ra frontend.
- Với lời gọi trực tiếp dịch vụ ngoài như segmentation, giữ nguyên operation/path/method/payload/response đang dùng; thay host/đường định tuyến qua adapter tương thích khi cần. Không bắt UI học một API segmentation khác.
- Kiểm kê đầy đủ generation không có nghĩa phải sửa mọi file UI hoặc triển khai lại những tính năng deprecated. Mỗi sửa đổi frontend phải nêu rõ lý do bắt buộc và không kéo theo thay đổi giao diện ngoài phạm vi.

Phạm vi inventory bao quát toàn bộ bề mặt generation trong repo. Kiểm kê một chức năng không tự cấp quyền redesign UI hoặc bật chức năng vốn chưa hoạt động.

## 2. Mốc đối chiếu và cách đọc

- Repo gốc: `storytold/artcraft-services`.
- Nhánh `main` được đối chiếu tại commit `e57ee3d63ac478a24149384bf1473ef97aa067f8`.
- Ngày lập kế hoạch: 2026-10-22.
- Phần mô tả hiện trạng bên dưới dựa vào source của commit gốc, không lấy implementation GoClaw đã sửa trong workspace làm hành vi gốc.
- Những endpoint có đăng ký route chưa chứng minh worker, tài khoản provider hoặc agent đã hoạt động. Phân biệt rõ source có implementation, frontend chưa nối, và chức năng đã bị tắt.
- Desktop Tauri là repo khác. Kiểm kê bindings dùng chung đang có ở đây, nhưng không tuyên bố đã sửa runtime native ở repo desktop.

Bộ tài liệu 07/08/09/10 thay hướng kiến trúc của plan 01/02/04/06 trước đó. Hạ tầng, database, storage và API host trong plan 03/05 tiếp tục được dùng khi phù hợp. Cách chuyển implementation GoClaw đã sửa trong workspace nằm ở mục 9 của plan này.

## 3. Generation trong repo gốc thực sự chạy thế nào?

### 3.1. Các thành phần và nơi thực thi

- `storyteller-web`: tiến trình HTTP Rust nhận request, xác thực, kiểm tra input, tính/trừ credit, ghi prompt và inference job.
- `artcraft_router`: thư viện Rust được biên dịch cùng caller. Dựng request theo model/provider; xử lý cost, capability và chuyển đổi tham số. Không phải một server riêng.
- `fal_client`, `kinovi_web_client`, `grok_api_client`, `worldlabs_api_client`, `beeble_client`, `gmicloud_client`: code client HTTP trong repo. Credential do backend/worker nạp từ cấu hình.
- Fal, Kinovi, Grok, World Labs, Beeble...: dịch vụ bên ngoài nhận HTTP request và thực hiện công việc.
- Các binary worker: poll provider, tiếp nhận/xử lý job, tải file và cập nhật trạng thái. Một số workflow cũ dùng worker inference/GPU thay cho provider HTTP.
- MySQL: người dùng, prompt/context, inference job, external request ID, wallet, media metadata.
- Redis: cache, rate limit, tiến độ; storage S3/R2: file input/output và preview; Elasticsearch: các chức năng tìm kiếm.

`StorytellerApiHostStore` chọn địa chỉ **backend ArtCraft** cho frontend. Đổi địa chỉ ở đây không đổi đích gọi Fal bên trong backend. Trong luồng ảnh, `fal_client` mặc định gửi queue request tới `https://queue.fal.run`; URL này nằm trong code client provider.

Nguồn: [README gốc](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/README.md), [router client](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/api_clients/artcraft/artcraft_router/src/client/router_client.rs), [Fal HTTP client](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/api_clients/fal_client/src/requests/core_api/fal_request.rs).

### 3.2. Chuỗi xử lý chung

1. Frontend lấy catalogue model/capability từ backend và hiển thị các điều khiển tương ứng.
2. Gửi model ID, prompt, thông số output và media token; API programmatic còn có input URL.
3. Handler xác thực session/API key/MCP theo từng endpoint; kiểm tra input, idempotency và quyền truy cập.
4. Lookup media; chuyển token thành URL hoặc chuẩn bị upload cho provider. Những input có vai trò riêng phải giữ đúng vai trò.
5. Hydrate request sang các kiểu `Generate*RequestBuilder`.
6. Pipeline chọn **execution provider**; cost builder có thể vẫn dùng provider `Artcraft` để tính giá riêng.
7. Dựng request/draft, tính và trừ wallet; draft có thể upload media trước khi gửi request generation.
8. Gọi HTTP provider. Thường nhận external request/order ID, chưa phải file hoàn chỉnh.
9. Ghi prompt, context và `generic_inference_jobs`; liên kết job với owner, model, external ID và ledger nếu có.
10. Trả job token cho frontend. Nhiều loại trả thêm `all_job_tokens`; phải giữ semantics batch/fan-out.
11. Provider callback webhook hoặc worker polling lấy trạng thái/output.
12. Tải và kiểm tra file, lưu storage ArtCraft, ghi media owner/prompt/batch/source job, cập nhật job thành công/thất bại.
13. Frontend poll API job và đọc media. Thumbnail video là công việc xử lý tiếp theo, không tự xuất hiện từ việc lưu file gốc.

Đây là mẫu chung; không giả định thứ tự transaction, cơ chế refund hay response của mọi handler giống nhau.

### 3.3. Catalogue và execution routing là hai lớp khác nhau

- `configs/omni_gen/{image,video,audio,mesh,splat}_models.rs` khai báo catalogue phục vụ UI.
- `GET /v1/omni_gen/models/{image,video,audio,mesh,splat}` trả catalogue; không phải mỗi lần đều khám phá model trực tiếp từ provider.
- `GET` catalogue có trường `models` và `providers`; provider quảng bá với UI có thể là `artcraft`.
- Provider thực thi được chọn trong pipeline; không suy ra Fal/Kinovi chỉ từ nhãn `artcraft` của catalogue.
- `POST /v1/omni_gen/cost/{type}` ước tính giá; `POST /v1/omni_gen/generate/{type}` thực thi.
- Request generation chung không cho frontend tự gửi URL provider hoặc credential.

Nguồn: [catalogue ảnh](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/configs/omni_gen/image_models.rs), [route omni-gen](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/routes/application_routes/omni_gen_routes.rs).

## 4. Inventory toàn bộ các đường generation

### 4.1. Năm luồng omni-gen chính

| Loại        | API generation              | Provider/thực thi trong source gốc                                   | Cơ chế nhận kết quả                       |
|-------------|-----------------------------|----------------------------------------------------------------------|-------------------------------------------|
| Ảnh         | /v1/omni_gen/generate/image | Midjourney/Seedream Pro qua KinoviWeb; phần còn lại pipeline qua Fal | Fal webhook; Kinovi polling               |
| Video       | /v1/omni_gen/generate/video | KinoviWeb, GrokApi, Fal theo model; có nhánh Minimax H3 GPU nội bộ   | Webhook, worker polling hoặc worker fleet |
| Audio       | /v1/omni_gen/generate/audio | Suno Music/Remix/Sounds/Sample qua KinoviWeb; SeedAudio1p0 qua Fal   | Kinovi polling; Fal webhook               |
| Mesh        | /v1/omni_gen/generate/mesh  | Các model mesh của pipeline hiện qua Fal                             | Fal webhook, xử lý GLB/OBJ/mesh và cover  |
| Splat/world | /v1/omni_gen/generate/splat | TripoSplat qua Fal; các model Marble qua World Labs                  | Fal webhook; World Labs polling           |

Chi tiết video:

- Các nhóm Seedance 2.x, các biến thể BytePlus/Ultra/Mini/Preview, Wan 3 và HappyHorse được map sang KinoviWeb trong pipeline.
- Grok Imagine Video và biến thể 1.5 được map sang GrokApi.
- Nhánh còn lại của pipeline map sang Fal.
- `shared_video_generation.rs` kiểm tra nhánh first-party Minimax H3 **trước khi gọi pipeline provider chung**. Đây là đường phải chuyển riêng; chỉ sửa `provider_for_model` sẽ không bao phủ nó.
- Có response/client cho GmiCloud và worker GmiCloud. Không nhầm việc có nhánh xử lý response với việc mọi model hiện đều được router chọn tới GmiCloud.
- API video dùng API key đã delegate vào `run_authenticated_video_generation`, nên phải giữ core chung.

Nguồn: pipeline [video](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/endpoints/omni_gen/generate/video/pipeline_v2/run_pipeline_v2.rs), [video core và Minimax](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/endpoints/omni_gen/generate/video/shared_video_generation.rs), [audio](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/endpoints/omni_gen/generate/audio/pipeline_v2/run_pipeline_v2.rs), [mesh](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/endpoints/omni_gen/generate/mesh/pipeline_v2/run_pipeline_v2.rs), [splat](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/endpoints/omni_gen/generate/splat/pipeline_v2/run_pipeline_v2.rs).

### 4.2. API programmatic và lớp tương thích

- `POST /v1/omni_api/generate/image`: API-key auth, có handler/pipeline ảnh riêng; phải chuyển cả nhánh này, không chỉ omni-gen.
- `POST /v1/omni_api/generate/video`: API-key auth, ingest URL thành media của owner rồi delegate sang video core chung.
- Các route upload image/video/audio và `/v1/omni_api/job_status/{job/{token},batch}` giữ nguyên.
- Source gốc đăng ký generation image/video cho omni-api; không tự ghi rằng đã có API programmatic audio/mesh/splat.
- Session/MCP clients dùng endpoint được hỗ trợ hiện có; không mở rộng quyền API key hoặc bỏ auth vì đổi provider.

Nguồn: [omni-api routes](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/routes/application_routes/omni_api_routes.rs).

### 4.3. Endpoint theo model và chức năng chuyên biệt

Toàn bộ `application_routes/generate_routes.rs` phải có adapter sang cùng gateway, thay vì chỉ sửa các pipeline omni-gen:

- Ảnh text-to-image: Flux Dev/Schnell/Pro/Ultra, GPT Image.
- Ảnh multi-function: Seedream 4/4.5/5 Lite, GPT Image 1.5, Nano Banana và các biến thể.
- Ảnh edit: Flux Kontext, Gemini Flash, GPT Image, Qwen, SeedEdit.
- Inpaint: Flux Dev Juggernaut, Flux Pro; có input mask, không được làm mất.
- Angle edit: Flux 2 LoRA và Qwen Edit 2511; giữ horizontal/vertical angle và zoom.
- Background removal: `/v1/generate/image/remove_background`, gọi Fal client cũ trực tiếp.
- Video image-to-video: Kling, Seedance, Veo theo endpoint gốc.
- Video multi-function: Kling 2.5/2.6/3, Seedance 1.5/2, Sora 2/Pro, Veo 3.1/Fast.
- VFX/background change: `/v1/generate/video/edit/beeble_switchx`; upload/submit qua Beeble và callback riêng.
- Object: Hunyuan 2.0/2.1 và Hunyuan3D v3 multi-function.
- World: các endpoint World Labs Marble mini/plus.
- Cost estimate cũ: `/v1/generate/cost_estimate/{image,video,splat}`.

Giữ request/response từng endpoint; không ép tất cả thành một DTO prompt-only hoặc trả schema job mới cho client cũ.

Nguồn đầy đủ các route/handler: [generate_routes.rs](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/routes/application_routes/generate_routes.rs).

### 4.4. Frontend editor, segmentation và character

- **PageDraw web:** editing gọi omni-gen; background removal gọi endpoint chuyên biệt. Inpainting web hiện là stub báo chưa hỗ trợ dù backend có endpoint inpaint cũ. Ghi nhận ranh giới này; không tự bật hoặc thêm UI inpaint trong công việc thay service. Endpoint inpaint đã có vẫn nằm trong inventory backend.
- **PageScene web:** `enqueueGeneration` hiện trả `status: fail` ngay cả khi đã đăng nhập. Ghi nhận đúng trạng thái và giữ nguyên trong đợt này; không tự mở thêm tính năng generation của editor.
- **VFX web:** `submitVFXJob` gọi Beeble endpoint; xử lý lỗi và polling riêng vẫn cần tương thích.
- **Segmentation:** `SegmentationApi.ts` gọi trực tiếp `hax.storyteller.ai/segmentation/new_session` và `/segmentation/generate_masks`. Thay host/định tuyến sang adapter backend tương thích đúng path/method/request/response đó, rồi gọi gateway; không đổi API mà component dùng.
- **Character:** `/v1/character/create` upload input lên Kinovi, gọi generation character và ghi job riêng; video còn resolve character token sang Kinovi ID. Phải có gateway character mapping/lifecycle thay cho ID Kinovi.
- **Shared Tauri bindings:** `frontend/libs/tauri-api/src/lib/generate/` có native `invoke`. Không assume đổi host web sẽ sửa được lệnh native; đánh dấu ranh giới repo và xác minh các browser adapter sử dụng chúng.
- `PromptsApi` chủ yếu đọc prompt, poll job và upload scene snapshot; không tự coi nó là một text-generation provider mới.

Nguồn: [PageDraw adapter](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/frontend/apps/artcraft-webapp/src/pages/pagedraw/web-adapter.tsx), [PageScene adapter](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/frontend/apps/artcraft-webapp/src/pages/pagescene/web-adapter.tsx), [segmentation](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/frontend/libs/api/src/lib/SegmentationApi.ts), [character create](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/endpoints/characters/create_character_handler.rs).

### 4.5. Legacy, workflow, animation và GPU fleet

Các đường sau phải được ghi nhận và xử lý có chủ đích, không bị bỏ sót vì nằm dưới `deprecated_endpoints`:

- `/v1/workflows/enqueue_acting_face`, `enqueue_face_mirror`: enqueue `LivePortrait`.
- `/v1/workflows/enqueue_lipsync`: enqueue `FaceFusion`.
- `/v1/workflows/enqueue_studio`, `enqueue_vst`: workflow render/style transfer.
- `/v1/workflow/comfy/create`, `/v1/workflow/upload/prompt`: workflow Comfy/upload workflow.
- `/v1/animation/face_animation/create`: SadTalker; `/v1/animation/rerender/create`: legacy rerender.
- `/v1/conversion/enqueue_render_engine_scene` và alias `enqueue_bvh_to_workflow`: render/scene job; `enqueue_fbx_to_gltf`: chuyển định dạng.
- `/v1/internal/minimax_jobs/obtain_job` và success/failure: giao thức fleet GPU Minimax nội bộ.
- `/v1/tts/inference` và `/tts/inference`: **TTS legacy đã bị tắt**; hiện trả token tổng hợp `synthetic_too_many_requests`, không tạo job thật.
- Các enum job còn có RVC, GPT-SoVITS, F5TTS, StyleTTS2, Tacotron2, SeedVC, MocapNet, StableDiffusion... Sự tồn tại enum/worker deprecated không có nghĩa đang có endpoint hoạt động cho tất cả.
- `/v1/vc/*` hiện là news/features/downloads/analytics; không coi đây là endpoint thực thi voice conversion.

Đối với workflow AI còn đăng ký route: thêm operation và adapter vào gateway nếu agent/tool hỗ trợ, giữ nguyên contract của route. Nếu chưa hỗ trợ, dùng error envelope/status và cơ chế unavailable hiện có; không tạo pending job không có worker hoặc thêm UI mới. TTS đã tắt giữ nguyên cho tới khi có yêu cầu bật lại và triển khai thực sự; ghi rõ trạng thái này trong ma trận nghiệm thu.

Chuyển định dạng/render thuần túy được giữ ở cơ chế hiện có; không gửi qua AI chỉ vì cùng dùng bảng job. Bổ sung bảng phân loại từng job type: AI cần chuyển, xử lý media cần giữ, deprecated đã tắt.

Nguồn: [legacy route registration](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/routes/legacy_routes/add_legacy_routes.rs), [workflow routes](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/routes/legacy_routes/workflow_routes.rs), [job types](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/schema/public/enums/src/by_table/generic_inference_jobs/inference_job_type.rs), [TTS stub](https://github.com/storytold/artcraft-services/blob/e57ee3d63ac478a24149384bf1473ef97aa067f8/crates/service/web/storyteller_web/src/http_server/endpoints/tts/enqueue_infer_tts_handler/enqueue_infer_tts_handler.rs).

## 5. Những phần giữ lại và thay thế trong ArtCraft

**Giữ lại:** API public, authentication/session/API-key/MCP, model ID và capability hợp lệ, tham số/default/limit, job token/polling, prompt/context, batch, owner/visibility, history/recreate, storage và thumbnail pipeline.

**Thay thế:** dispatch execution provider, outbound client, external job mapping, collector nhận kết quả và policy pricing/credit/subscription cho bản self-host.

Không giả lập giao thức Fal; không đổi `fal_client` thành một client có ý nghĩa khác. Thêm provider `GenerationGateway` và một client gọi service theo hướng dẫn 09. Những provider cũ không được dùng làm fallback tự động trong chế độ gateway.

Không viết queue/executor/artifact server của service vào `storyteller-web`. Backend chỉ giao việc và quản lý job/media của ArtCraft; service thực hiện công việc qua GoClaw.

## 6. Bảo toàn tham số và capability

Giữ cả request gốc và thông số hiệu lực sau default/normalization để lịch sử và recreate chính xác. Hợp đồng wire thực tế lấy từ `artcraft_api_defs` và serializer; không đoán theo nhãn UI.

| Nhóm         | Tham số phải bảo toàn                                                                                   |
|--------------|---------------------------------------------------------------------------------------------------------|
| Ảnh          | model, prompt, ảnh reference, aspect ratio, resolution, quality, batch count, angle/zoom                |
| Inpaint      | ảnh gốc, mask, prompt/negative prompt và cấu hình output được endpoint đó hỗ trợ                        |
| Video        | prompt/negative prompt, start/end frame, image/video/audio reference, character reference               |
| Video output | duration, aspect ratio, resolution, quality, bitrate, output format, batch count, generate_audio        |
| Audio        | prompt/style, audio/image input, keep_lyrics, instrumental, loopable, BPM, key                          |
| Audio output | sample rate, speed, volume, pitch, số clip và quan hệ giữa các clip                                     |
| Mesh         | text/multi-view image/input mesh, output type, polygon type, face count, PBR, texture, geometry quality |
| Splat/world  | prompt, image/video reference, panoramic, disable_recaption, cover và output splat                      |
| VFX          | video nguồn, ảnh reference, prompt, mask/control riêng nếu operation hỗ trợ                             |
| Character    | input image/video theo contract, name/description và ID ánh xạ lifecycle                                |
| Workflow     | workflow/preset, input image/audio/video/scene, tham số điều khiển và output riêng của từng workflow    |

Quy tắc bắt buộc:

1. Service ánh xạ `model + operation` sang agent/tool; không phải mỗi người dùng tự chọn type cho agent trong browser.
2. GoClaw phải nhận được payload có cấu trúc qua API/tool thực tế của bản self-host. Nếu API chỉ nhận message, vẫn phải có schema/tool validation hai đầu và manifest có cấu trúc.
3. Chỉ ghép “hãy tạo ảnh 1024px” vào prompt không chứng minh tham số được thi hành. Agent/tool phải thực sự thực hiện và output phải được kiểm tra.
4. Tham số được hỗ trợ giữ đúng giá trị và đơn vị; chuẩn hóa có chủ đích, ví dụ aspect ratio sang width/height.
5. Trường không hỗ trợ phải bị từ chối rõ trước submit hoặc bị catalogue vô hiệu hóa. Không drop reference, mask, count, duration, seed/extension nếu operation đó có.
6. Model ID và tên phải phản ánh model/tool thực sự được GoClaw chạy. Không giữ nhãn Flux/Midjourney nhưng âm thầm sinh bằng model khác.
7. Không tự quảng bá tất cả model trong source là khả dụng. Catalogue self-host lấy giao của capability đã có trong ArtCraft và model/agent được service cấu hình.
8. Không thêm điều khiển frontend hoặc mở rộng/version lại API ArtCraft trong công việc thay service này. Mapping tham số bổ sung nếu cần nằm trong cấu hình nội bộ của service.
9. `estimate_only` là dữ liệu dùng ước tính; không để các hint đó điều khiển thực thi hoặc thay cho metadata file được xác thực.

## 7. Những phần phải sửa và cách sửa

### 7.1. Client, DTO và router

- Tạo client HTTP và ArtCraft collector trong `re-implement/generation-gateway/{client,collector}/`; đăng ký workspace/dependency cần thiết. Import DTO có version từ contracts do plan 08 cung cấp; không implement REST service hoặc executor GoClaw trong plan backend.
- Thêm variant `GenerationGateway` trong `RouterProvider`, `RouterClient`, kiểu lỗi và các match liên quan.
- Thêm adapter request/response cho năm nhóm `generate_{image,video,audio,mesh,splat}`.
- Tận dụng `Generate*RequestBuilder` và các kiểu tham số chuẩn hóa hiện có. Tạo nhánh gateway trước bước chuyển sang DTO Fal/Kinovi để không bị giới hạn hoặc mất tham số bởi adapter provider cũ.
- DTO gửi gateway là DTO của mình, không phụ thuộc `Fal*RequestState` hoặc session/cookie Kinovi.
- Cho phép các operation chuyên biệt dùng cùng client chung; không nhân bản client cho từng handler.
- `fal_client` giữ nguyên nghĩa là client Fal, không đổi tên ngầm service bên trong nó.

Điểm nối hiện hữu: `crates/api_clients/artcraft/artcraft_router/src/{api,client,generate}/`.

### 7.2. Backend omni-gen, omni-api và route theo model

- Chuyển dispatch tại cả năm `omni_gen/generate/*/pipeline_v2/run_pipeline_v2.rs`.
- Video phải xử lý nhánh Minimax trước pipeline ở `shared_video_generation.rs`; mode gateway không được enqueue tiếp vào fleet GPU cũ.
- Chuyển pipeline ảnh riêng dưới `omni_api`. Video tiếp tục dùng core chung, không tạo thêm một implementation video khác.
- Giữ format public của job token/batch/error/default; dùng shared orchestration để chống lệch hành vi giữa API key và session.
- Với `/v1/generate/*`, giữ route/DTO cũ rồi dịch sang operation gateway bên trong handler/helper.
- Character bỏ dependency upload/ID Kinovi trong mode gateway; giữ character token ArtCraft ổn định.
- Segmentation có adapter implementation dưới thư mục `re-implement`; giữ path `/segmentation/new_session`, `/segmentation/generate_masks`, method và request/response gốc khi trỏ về host của mình. Không tạo namespace API public mới để buộc frontend đổi contract.
- Các legacy enqueue AI được nối sang gateway hoặc bị từ chối capability trước enqueue. Không sửa bằng cách giả một job token thành công.

### 7.3. Job và nhận kết quả

- Thêm `InferenceJobType::GenerationGatewayQueue` và external provider enum riêng; giữ nguyên giá trị serialize của tất cả enum cũ.
- Dùng `generic_inference_jobs` hiện có; giữ `maybe_external_third_party_id`, owner, visibility, prompt/context, platform và batch.
- Query mới đặt dưới `mysql_queries/src/queries/re-implement/`, args struct và generic executor theo hướng dẫn của crate.
- Thêm collector worker riêng poll Gateway. Không ghi job mới vào `fal_queue` hoặc `seedance2pro_queue` vì worker/webhook cũ không hiểu giao thức mới.
- Tái sử dụng helper import media, ghi success/failure, phân loại output và thumbnail khi phù hợp; tách helper khỏi mã đặc thù Fal nếu cần.
- Việc tồn tại helper không có nghĩa được gọi nguyên xi: kiểm tra batch, cover, GLB/OBJ, splat, audio duration, MIME và kích thước.
- Job cũ đang chạy vẫn do worker/webhook cũ hoàn tất trong rollout. Chỉ dừng worker cũ khi hết job và không còn feature nào dùng nó.
- Nếu cần schema bổ sung, thiết kế migration cùng runner rõ ràng; không đặt migration lồng thư mục khiến runner hiện có không tìm thấy `up.sql`.

### 7.4. Catalogue backend và bàn giao frontend

- Đối chiếu `configs/omni_gen/*_models.rs` với capability Gateway; giữ model ID, schema/default/limit public và không quảng bá model khác với model thực thi.
- Backend chịu trách nhiệm catalogue/cost response, generation/job/media API và adapter segmentation tương thích. Không đưa URL/token GoClaw hoặc Gateway DTO ra browser.
- Bàn giao cho agent Plan 10 danh sách endpoint, model/capability, ví dụ request/response/error/batch và host/path segmentation theo contract hiện hữu.
- Toàn bộ việc khôi phục caller, model controls, polling, xử lý pricing và cấu hình host frontend chuyển sang [Plan 10](10-generation-gateway-frontend-plan.md). Agent backend không sửa các file đó.

### 7.5. Pricing, subscription và credential

- Thiết lập một execution policy self-host dùng chung; policy gateway không gọi wallet deduction, subscription entitlement hoặc provider pricing cũ.
- Các cost endpoint vẫn trả schema cũ với thông tin nhất quán: generation không thu credit ArtCraft. Không trả giá cũ rồi bỏ trừ tiền ở bước sau.
- Bỏ gate subscription/credit phía server trên tất cả feature AI đã kiểm kê, gồm PageDraw/VFX và adapter dùng chung. Prompt nâng cấp và điểm vào pricing/billing trên UI thuộc Plan 10.
- Không xóa lịch sử ledger hay thay đổi tài khoản của bản hosted.
- Auth, API-key authorization, ownership, input limits, rate/concurrency và quyền quản trị vẫn được giữ.
- ArtCraft chỉ giữ URL/auth key của Gateway. Gateway giữ URL/token GoClaw và mapping model-agent.
- UI quản trị kết nối GoClaw/agent thuộc repo service riêng theo Plan 08; backend và frontend ArtCraft không triển khai màn hình cấu hình này. Skills vẫn quản lý trực tiếp tại GoClaw.
- GoClaw quản lý credential provider thực thi của mình. Startup chế độ gateway không được bắt buộc FAL/GMICLOUD/GROK/WORLDLABS/BEEBLE/Kinovi credential chỉ để phục vụ các luồng đã thay.
- Chỉ chuyển các integration AI không còn cần sang khởi tạo có điều kiện; credential email/billing ngoài phạm vi AI xử lý theo cấu hình riêng. Google login self-host được xử lý ở mục 7.6.

### 7.6. Đăng nhập Google cho self-host

- Giữ `/v1/accounts/google_sso`, request/response, cơ chế tạo/liên kết tài khoản và session hiện có. Không chuyển xác thực người dùng sang Gateway/GoClaw.
- `http_server/endpoints/users/google_sso/check_claims.rs` hiện hardcode client ID cũ trong `allowed_audiences`. Chuyển danh sách này sang cấu hình server `GOOGLE_SIGN_IN_ALLOWED_AUDIENCES` (đề xuất: danh sách client ID phân cách bằng dấu phẩy), nạp và validate ở startup, truyền vào verifier.
- Khi Google login được bật, thiếu hoặc rỗng cấu hình phải báo lỗi cấu hình rõ ràng; không bỏ kiểm tra audience, không nhận mọi client ID và không âm thầm fallback client ID cũ. Giữ xác minh chữ ký, issuer, thời hạn token và các kiểm tra claims hiện có.
- Bàn giao tên biến và định dạng cấu hình cho frontend/tích hợp; client ID frontend phải thuộc danh sách audience backend cho phép. Duy trì cấu hình hosted riêng nếu vẫn vận hành hosted.
- Dùng MySQL/session store của deployment tự host; không thay cơ chế mapping tài khoản Google hoặc tự đồng bộ dữ liệu tài khoản Storyteller.
- Bổ sung cấu hình mẫu và truyền biến vào deployment ArtCraft hiện hữu; file mới dưới `re-implement`. Gateway không cần biến cấu hình này.
- Rà soát CORS/cookie/session theo domain triển khai; chỉ sửa điểm bắt buộc để API login và request sau login dùng đúng backend. Giữ bí mật cookie/session phía server; OAuth client ID là thông tin công khai.

Đây là phần bổ sung để tự quản lý OAuth client, không phải viết lại authentication toàn dự án. Luồng Google ID token đang dùng không yêu cầu thêm client secret vào browser.

## 8. Tổ chức source thuộc plan backend

Tất cả file source mới nằm dưới thư mục có tên `re-implement`:

```text
re-implement/generation-gateway/
  client/                         # Client HTTP gọi service riêng
  collector/                      # ArtCraft worker poll/import/finalize job

crates/api_clients/artcraft/artcraft_router/src/re-implement/
  ...                             # Provider/request/response adapter

crates/service/web/storyteller_web/src/re-implement/
  ...                             # Config/policy/helpers của ArtCraft

crates/schema/database/mysql_queries/src/queries/re-implement/
  gateway_jobs/                   # Query dùng database ArtCraft

```

Contracts, service và executor thuộc plan 08. Nếu service ở repo khác, client dùng contracts theo version/tag cố định thay vì phụ thuộc source nội bộ của service.

Các điểm sửa file gốc được giới hạn vào module/dependency registration, router/client enum và match, năm pipeline, video shared core/Minimax branch, omni-api ảnh, handler chuyên biệt, query/enum job, startup config và pricing policy. File trong `frontend/` thuộc riêng Plan 10.

Không đặt query trong handler. Không đặt hàm/struct vào `mod.rs`. Giữ serialize cũ cho enum và lịch sử database. Enum/type nội bộ mới không được buộc frontend đổi API job schema; status/result adapter phải tiếp tục trả contract gốc.

Nếu cần migration bổ sung, tuân thủ quy ước query/schema của repo và kiểm tra runner tìm đúng migration; không tạo một thư mục lồng `re-implement` rồi giả định runner hiện tại tự đọc được.

## 9. Xử lý implementation GoClaw đã làm trong workspace

Những thay đổi trước đó không phải baseline để tiếp tục nhân rộng:

- Frontend đang dùng endpoint `/v1/omni_gen/generate/goclaw` riêng cho image/video/audio: Plan 10 chuyển caller về API gốc và gỡ store/hook/helper agent không còn dùng. Backend phối hợp thời điểm gỡ endpoint, không tự sửa caller frontend.
- Backend handler GoClaw đồng bộ, parse Markdown, tải output ngay: thay bằng submit Gateway và collector; chỉ gỡ đường cũ sau khi kiểm kê caller để tránh đứt compatibility.
- URL/token GoClaw trong file config chuyển về service Gateway. Backend ArtCraft chỉ cần endpoint/auth Gateway.
- Không tiếp tục ghi settings GoClaw từ frontend hoặc dùng table settings cũ làm nguồn cấu hình thứ hai.
- Giữ các phần đúng mục đích như API host tự host, CORS cần thiết, storage config và ownership fixes.
- Không reset toàn bộ repo hoặc revert hàng loạt commit; đối chiếu từng hunk, giữ thay đổi không liên quan.
- Ba lỗi review trước (gallery ảnh không refresh, thumbnail video, thiếu prompt/context) được giải quyết bằng việc dùng job/media lifecycle chuẩn và có acceptance riêng, không chỉ đổi endpoint.

## 10. Công việc backend theo thứ tự

1. Chốt manifest route → handler → provider → result path theo mục 4; phân loại active, stub, deprecated và native ngoài phạm vi repo.
2. Chốt contract/version dùng chung theo hướng dẫn 09, cùng plan service. Đóng băng các public request/response ArtCraft cần giữ.
3. Thêm HTTP client và provider adapter; bảo toàn các tham số trước bước chuyển sang DTO Fal/Kinovi.
4. Thêm job type/external ID mapping, durable submit intent và collector; giữ owner/prompt/context/batch.
5. Chuyển năm pipeline, core video/Minimax, omni-api ảnh và video API-key qua cùng service client.
6. Chuyển các route chuyên biệt, character, segmentation và workflow AI active. Capability chưa có trả error/unavailable theo contract hiện hữu, không tạo job treo hoặc fallback provider cũ.
7. Áp dụng self-host pricing policy cho tất cả nhánh đã chuyển; giữ auth/ownership/rate/concurrency limit.
8. Cấu hình audience Google login theo mục 7.6; bàn giao catalogue/cost/job/segmentation và OAuth config cho Plan 10. Phối hợp thời điểm chuyển caller và gỡ endpoint GoClaw cũ; không sửa frontend trong task backend.
9. Nối cấu hình và deploy collector theo hướng dẫn 09 sau khi được phép. Giữ worker cũ phục vụ job tồn cho tới khi drain xong.
10. Chỉ gỡ implementation GoClaw trực tiếp cũ khi hết caller và job cần tương thích.

Không triển khai service trong plan này. Không thay database/storage/authentication toàn dự án chỉ vì đổi generation provider.

## 11. Tiêu chí hoàn tất phía backend

- [ ] Toàn bộ nhóm/route tại mục 4 có kết quả kiểm kê, adapter hoặc trạng thái chưa hỗ trợ rõ ràng; không chỉ hoàn tất riêng ảnh.
- [ ] API ArtCraft giữ path/method/request/response/default/limit/job/polling; không chuyển version hoặc yêu cầu frontend hiểu DTO nội bộ.
- [ ] Auth, API-key scope, owner/visibility và input validation vẫn đúng.
- [ ] Google login dùng audience cấu hình của mình, khớp client ID frontend; không còn phụ thuộc client ID hardcode cũ. Chữ ký/issuer/expiry/audience vẫn được kiểm tra; dữ liệu tài khoản/session ở deployment tự host.
- [ ] Client gửi đúng model/operation/parameters/role của media; không drop mask, batch, frame, audio/video ref, multi-view hoặc character.
- [ ] Client/service lỗi không fallback Fal/Kinovi/Grok/World Labs/Beeble/hax.storyteller.ai.
- [ ] Các nhánh Minimax, omni-api và endpoint chuyên biệt không bypass gateway mode.
- [ ] Không trừ credit hoặc chặn subscription ArtCraft cho generation self-host; cost response và UI nhất quán.
- [ ] Durable submit/reconcile, retry và collector không tạo trùng job/media hoặc mất job khi timeout/restart.
- [ ] Chỉ complete job sau khi import output bắt buộc; lưu prompt/context, batch, metadata, cover và thumbnail phù hợp.
- [ ] Không sửa file trong `frontend/`; bàn giao đủ contract cho Plan 10 và chưa gỡ endpoint cũ khi caller chưa chuyển.
- [ ] Runtime native Tauri ở repo khác không nằm trong công việc này.
- [ ] Source mới nằm dưới `re-implement`; thay đổi gốc chỉ là điểm tích hợp cần thiết.
- [ ] Credential provider AI cũ không bắt buộc startup trong mode gateway; ArtCraft không giữ token GoClaw.
- [ ] Job cũ còn được xử lý và rollback không làm binary cũ gặp enum/job type chưa hiểu.
- [ ] Kiểm chứng tích hợp đầy đủ theo hướng dẫn 09 sau khi được cho phép.

**Ràng buộc hiện tại:** chỉ lập kế hoạch/đọc source. Không chạy, build, test hoặc deploy repo. Các bước nghiệm thu runtime trong tài liệu là công việc tương lai, không phải quyền chạy ngay.

