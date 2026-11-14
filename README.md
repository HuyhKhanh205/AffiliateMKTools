# Affiliate Hub

App làm affiliate cho **Shopee, Lazada, Tiki, TikTok Shop** với chi phí gần như 0đ. Chạy trên Android, iOS và web, viết bằng Expo SDK 57 và Supabase.

| Tính năng | Bạn nhận được |
|---|---|
| **Đăng bài tự động** | Dán link sản phẩm → app tự đoán tên, viết bài cho Threads / Instagram / TikTok (AI hoặc mẫu miễn phí) → xem lại → bấm **Đăng** lên Threads và Instagram. TikTok: copy caption (tự động ở bản sau). |
| **Link theo dõi** | Mỗi sản phẩm có một link ngắn riêng cho từng kênh (TikTok, Facebook, Zalo, bio...). Mỗi click được đếm trước khi chuyển người xem sang link affiliate. |
| **Dashboard** | Click hôm nay / 7 / 30 ngày, biểu đồ 14 ngày, tỉ lệ theo sàn và theo kênh, top sản phẩm, hoa hồng, **thu nhập trên mỗi click (EPC)**. |
| **Trang bio** | `/u/<handle>`: một trang công khai liệt kê sản phẩm, để dán vào bio TikTok/Instagram/Facebook. Sản phẩm đang giảm giá được đưa lên đầu. |
| **Viết nội dung bằng AI** | Hook, caption, CTA và hashtag tiếng Việt cho từng kênh, có sẵn câu công bố link affiliate. Dùng Claude Haiku 5.5, khoảng 0,0005$ một lần. |
| **Săn deal** | Đặt giá mục tiêu; khi giá ≤ mục tiêu hoặc giảm ≥15% so với trung bình 30 ngày, sản phẩm hiện ở tab Deal. Giá Shopee tự cập nhật mỗi sáng nếu có API key. |
| **Hoa hồng** | Dán báo cáo CSV từ Shopee / AccessTrade / TikTok (tự nhận cột tiếng Việt và tiếng Anh, nhập lại không bị trùng), hoặc nhập tay. |

## Chi phí

| Thành phần | Dịch vụ | Chi phí |
|---|---|---|
| Database, đăng nhập, đếm click, chạy lịch | Supabase gói Free | 0đ. Project tạm dừng nếu 7 ngày không có truy cập; vào dashboard bấm Restore là chạy lại. |
| Web + trang bio | Cloudflare Pages hoặc Netlify gói free | 0đ |
| App điện thoại | Expo Go khi phát triển, EAS Build gói free khi cần APK | 0đ |
| AI | Claude Haiku 5.5 ($0.10 / $0.50 mỗi 1 triệu token) | ~1.000 caption ≈ 0,5$. Mặc định giới hạn 50 lần/ngày/người (`AI_DAILY_LIMIT`). |
| API sàn | Shopee Affiliate Open API, AccessTrade | 0đ, cần đăng ký và được duyệt |

## Kiến trúc

```
App Expo (Android / iOS / Web) ──supabase-js──▶ Supabase Postgres (RLS: mỗi user chỉ thấy dữ liệu của mình)
     │                                              ▲
     ├─ Edge Function ai-content ──▶ Claude Haiku 5.5
     └─ Edge Function product-lookup ──▶ Shopee API / AccessTrade (tạo link affiliate)

Người xem ──▶ trang bio /u/<handle> ──▶ Edge Function go/<slug> (ghi click) ──302──▶ link affiliate
pg_cron mỗi sáng ──▶ Edge Function price-check ──▶ Shopee API ──▶ price_history ──trigger──▶ is_deal
```

- **Không cào (scrape) web của sàn**: việc đó vi phạm điều khoản và hay bị chặn. Giá và link lấy qua API chính thức; chưa có key thì nhập tay, app vẫn đủ chức năng.
- Logic deal nằm trong trigger SQL `apply_price()`, dùng chung cho cập nhật tay và tự động.
- Lượt xem trước link của Facebook, Zalo, Telegram... (bot) không bị tính là click.

```
src/app/            màn hình (Expo Router): login, (tabs)/{index,products,deals,earnings,settings}, product/{new,[id]}, u/[handle]
src/lib/            logic thuần (có unit test): platform, links, stats, csv; supabase client, auth
src/components/     UI dùng chung (không thêm thư viện chart: biểu đồ vẽ bằng View)
supabase/migrations bảng, RLS, trigger, view daily_clicks, hàm get_bio
supabase/functions  go, ai-content, product-lookup, price-check (+ _shared/providers cho Shopee, AccessTrade)
```

## Trạng thái deploy (14/11/2026)

| Thành phần | Trạng thái |
|---|---|
| Supabase project `ujaqushxozsnjpojalen` (Sydney) | Migration `20261113000000_init` đã chạy; xác nhận email đã tắt (đăng ký là dùng được ngay) |
| Edge Functions | `go`, `price-check`, `social-oauth`, `refresh-social-tokens` (không cần JWT); `ai-content`, `product-lookup`, `compose-post`, `publish` (cần đăng nhập) — đều ACTIVE |
| Đăng bài tự động | Đã chạy phía server. **Cần bạn tạo app Meta một lần** (mục bên dưới) rồi bấm Kết nối trong Cài đặt |
| Cron `daily-price-check` | 01:00 UTC (08:00 giờ VN) mỗi ngày; secret `CRON_SECRET` đã đặt |
| Test đầu-cuối trên project thật | 14/14 PASS: đăng ký, trigger, link, redirect 302, đếm click (bỏ qua bot), trang bio cho khách, RLS |
| `ANTHROPIC_API_KEY` | **Chưa có** — thêm ở Dashboard → Edge Functions → Secrets thì nút "Viết caption" mới chạy |
| Web (GitHub Pages) | <https://huyhkhanh205.github.io/AffiliateMKTools> — tự build lại mỗi lần push (`.github/workflows/deploy-web.yml`). Lần đầu cần bật Settings → Pages → Source: **GitHub Actions** |

### Mở app (không cần cài gì)

- **Laptop:** mở <https://huyhkhanh205.github.io/AffiliateMKTools> bằng Chrome/Edge. Muốn có icon như app: Chrome → menu ⋮ → *Truyền, lưu và chia sẻ* → *Cài đặt trang dưới dạng ứng dụng* (Edge: … → *Ứng dụng* → *Cài đặt trang web này*).
- **iPhone:** mở link bằng **Safari** → nút Chia sẻ → **Thêm vào Màn hình chính**. Icon Affiliate Hub xuất hiện, bấm là mở toàn màn hình như app.
- Trang bio công khai: `https://huyhkhanh205.github.io/AffiliateMKTools/u/<handle>`.

Chạy bản phát triển ở máy: tạo `.env.local` theo `.env.example`, điền URL `https://ujaqushxozsnjpojalen.supabase.co` và *Publishable key* (Dashboard → Project Settings → API Keys), rồi `npx expo start`.

## Kết nối Threads / Instagram để đăng tự động (làm một lần, ~15 phút)

App chỉ dùng **API chính thức** của Meta, miễn phí. Vì chỉ mình bạn dùng, app Meta để ở chế độ phát triển, **không cần Meta xét duyệt**. Bạn chỉ cần thêm chính mình làm "tester".

**Giới hạn cần biết:**
- Threads đăng được chữ, ảnh và link bấm được.
- Instagram **bắt buộc có ảnh** và link trong caption không bấm được, nên app ghi "link ở bio".
- Facebook trang cá nhân/nhóm và Zalo cá nhân không có API đăng bài.

1. **Instagram → tài khoản Chuyên nghiệp:** trong app Instagram vào Cài đặt → Loại tài khoản và công cụ → Chuyển sang tài khoản chuyên nghiệp (Creator hoặc Business). Miễn phí, không cần Fanpage.
2. **Tạo app** ở <https://developers.facebook.com/apps> → Create app. Chọn use case:
   - **Access the Threads API**;
   - **Manage messaging & content on Instagram** (Instagram API with Instagram login).
3. **Redirect URI.** Dán đúng địa chỉ này vào cả hai chỗ:
   ```
   https://ujaqushxozsnjpojalen.supabase.co/functions/v1/social-oauth/callback
   ```
   - Threads: use case Threads → Settings → *Redirect Callback URLs*.
   - Instagram: Instagram → API setup with Instagram login → *Set up Instagram business login* → *OAuth redirect URIs*.
4. **Quyền:**
   - Threads: bật `threads_basic` và `threads_content_publish`.
   - Instagram: bật `instagram_business_basic` và `instagram_business_content_publish`.
5. **Thêm bạn làm tester:** App roles → Roles → thêm tài khoản Threads của bạn (Threads Tester) và tài khoản Instagram (Instagram Tester). Sau đó **chấp nhận lời mời**:
   - Threads: Cài đặt → Tài khoản → Quyền truy cập trang web → Lời mời;
   - Instagram: Cài đặt → Ứng dụng và trang web → Lời mời tester.
6. **Lấy ID/secret, dán vào Supabase.** Vào Dashboard → Edge Functions → **Secrets** (không dán vào chat hay vào code):
   - `THREADS_APP_ID`, `THREADS_APP_SECRET`: App settings → Basic → *Threads App ID / Threads App secret*;
   - `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`: Instagram → API setup with Instagram login → *Instagram App ID / Instagram app secret*.
7. Mở app → **Cài đặt → Kết nối kênh** → bấm **Kết nối** từng kênh → đăng nhập → Cho phép. Thấy "@tên ✓" là xong.

Token tự gia hạn mỗi tuần (cron `weekly-refresh-social-tokens`). Mỗi kênh app giới hạn 25 bài/ngày (`DAILY_POST_LIMIT`) để tránh bị coi là spam.

**Đăng bài:** tab **Đăng bài** → dán link affiliate (trong app Shopee/Lazada/TikTok: Chia sẻ → Lấy link) → **Chọn ảnh** → **Tạo bài viết** → sửa nếu muốn → **Đăng**.

## Cài đặt từng bước

### 1. Chạy app ở máy

```sh
npm install
cp .env.example .env.local     # điền ở bước 2
npx expo start                 # bấm w để mở web, hoặc quét QR bằng Expo Go
```

Chưa điền Supabase vẫn xem được trang bio mẫu tại `/u/demo`.

### 2. Tạo Supabase (miễn phí)

1. Tạo project ở <https://database.new>, chọn region Singapore cho nhanh.
2. **Project Settings → API**: copy *Project URL* và *Publishable key* vào `.env.local`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   Hai giá trị này public theo thiết kế; RLS bảo vệ dữ liệu. **Không bao giờ** đưa secret key / service role key vào app.
3. Tạo bảng (chọn một cách):
   - **SQL Editor** → dán toàn bộ `supabase/migrations/20261113000000_init.sql` → Run; hoặc
   - CLI: `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`
4. (Tuỳ chọn) **Authentication → Providers → Email**: tắt *Confirm email* nếu muốn đăng ký là dùng được ngay.

### 3. Deploy Edge Functions

```sh
npx supabase functions deploy go
npx supabase functions deploy ai-content
npx supabase functions deploy product-lookup
npx supabase functions deploy price-check

# AI (lấy key tại https://console.anthropic.com)
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# tuỳ chọn: npx supabase secrets set AI_DAILY_LIMIT=50
```

`go` và `price-check` đã được cấu hình `verify_jwt = false` trong `supabase/config.toml` (link click công khai; price-check kiểm tra header bí mật riêng).

Link theo dõi có dạng `https://<project-ref>.supabase.co/functions/v1/go/<slug>`. Muốn link ngắn đẹp hơn, trỏ một domain riêng (vd Cloudflare Worker) về địa chỉ đó rồi đặt `EXPO_PUBLIC_SHORT_LINK_BASE`.

### 4. API sàn (tuỳ chọn, để tự tạo link và tự cập nhật giá)

| Sàn | Đăng ký | Secrets |
|---|---|---|
| Shopee | <https://affiliate.shopee.vn> → Open API (cần được duyệt) | `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET` |
| Lazada, Tiki | <https://pub.accesstrade.vn> → tham gia chiến dịch, lấy API key | `ACCESSTRADE_TOKEN`, `ACCESSTRADE_CAMPAIGN_LAZADA`, `ACCESSTRADE_CAMPAIGN_TIKI` |
| TikTok Shop | Chưa có API công khai cho affiliate cá nhân | Tạo link trong app TikTok rồi dán vào |

```sh
npx supabase secrets set SHOPEE_APP_ID=... SHOPEE_APP_SECRET=...
```

> Hai adapter `supabase/functions/_shared/providers/{shopee,accesstrade}.ts` được viết theo tài liệu API công khai nhưng **chưa được chạy với key thật**. Lần đầu dùng, kiểm tra log ở Supabase → Edge Functions; nếu sàn đổi tên trường thì sửa câu query trong file tương ứng.

**Tự cập nhật giá mỗi sáng (Shopee):**

```sh
npx supabase secrets set CRON_SECRET=$(openssl rand -hex 24)
```

Mở `supabase/cron.example.sql`, thay `<PROJECT_REF>` và `<CRON_SECRET>`, chạy trong SQL Editor.

### 5. Đưa web + trang bio lên mạng (miễn phí)

```sh
npm run export:web      # tạo thư mục dist/ (đã gồm file _redirects cho SPA)
```

- **Cloudflare Pages**: Create project → Direct upload → kéo thả thư mục `dist`. Hoặc nối repo GitHub với build command `npx expo export --platform web`, output `dist`, và đặt các biến `EXPO_PUBLIC_*` trong phần Environment variables.
- **Netlify**: kéo thả `dist` vào <https://app.netlify.com/drop>.

Sau đó đặt `EXPO_PUBLIC_SITE_URL=https://<tên>.pages.dev` rồi build lại để app hiện đúng link bio.

### 6. App Android (APK miễn phí)

```sh
npx eas-cli@latest build:configure                       # lần đầu: tạo eas.json
npx eas-cli@latest build -p android --profile preview    # profile preview tạo file .apk cài trực tiếp
```

## Dùng thế nào cho hiệu quả

1. **Mỗi kênh một link.** Tạo link riêng cho TikTok, Facebook, Zalo... để biết kênh nào ra tiền, rồi dồn sức vào kênh đó (Dashboard có gợi ý).
2. **Nhìn EPC, không chỉ nhìn click.** Nhập báo cáo hoa hồng hằng tuần; EPC = hoa hồng ÷ click cho biết sản phẩm/kênh nào đáng đẩy.
3. **Đặt giá mục tiêu** cho sản phẩm bán chạy; tab Deal báo khi nên đăng lại.
4. **Cho AI dữ kiện thật.** Ghi trải nghiệm thật vào ô "Điểm nổi bật"; AI chỉ dùng thông tin bạn đưa và luôn kèm câu công bố affiliate.

## Phát triển

```sh
npm test              # unit test src/lib (Jest)
npm run typecheck     # tsc
npx expo lint
deno test supabase/functions/_shared/providers/shopee.test.ts
deno check supabase/functions/*/index.ts
```

Cấu trúc dữ liệu, chính sách RLS và trigger nằm trong `supabase/migrations/`. Mọi thay đổi schema nên tạo file migration mới thay vì sửa file cũ.
