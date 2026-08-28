import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("Savanna PWA assets", () => {
  it("declares an installable standalone manifest with branded icons", async () => {
    const source = await readFile(resolve(projectRoot, "client/public/manifest.webmanifest"), "utf8");
    const manifest = JSON.parse(source) as {
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      icons: Array<{ src: string; sizes: string; purpose?: string }>;
    };

    expect(manifest.name).toContain("Savanna");
    expect(manifest.short_name).toBe("Savanna");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));

    // Icons must ship with the app. They used to point at /manus-storage/...,
    // an external host, which meant an install showed a broken icon whenever
    // that host was unreachable and the mark could not be rebranded locally.
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/"), `icon must be a root-relative path: ${icon.src}`).toBe(true);
      expect(icon.src).not.toContain("manus-storage");
      const onDisk = resolve(projectRoot, "client/public", icon.src.replace(/^\//, ""));
      await expect(access(onDisk), `icon missing from client/public: ${icon.src}`).resolves.toBeUndefined();
    }

    // Without a maskable icon Android crops the mark to an arbitrary shape.
    expect(manifest.icons.some(icon => (icon.purpose ?? "").includes("maskable"))).toBe(true);
  });

  it("keeps the offline service worker away from sensitive API traffic", async () => {
    const worker = await readFile(resolve(projectRoot, "client/public/service-worker.js"), "utf8");

    // Only same-origin GETs are cacheable; API traffic and mutations always go
    // to the network so no response carrying user data is ever written to disk.
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toMatch(/request\.method\s*(?:===|!==)\s*"GET"/);

    // A response body can only be consumed once, so the copy that goes to the
    // cache has to be a clone — otherwise caching silently swallows the body.
    expect(worker).toContain("response.clone()");
  });

  it("applies service worker updates only after the page agrees", async () => {
    const worker = await readFile(resolve(projectRoot, "client/public/service-worker.js"), "utf8");

    // Activating during install swaps the cached shell out from under code that
    // is still running, so lazily-loaded chunks 404. The worker waits for the
    // page to opt in instead.
    expect(worker).toContain('addEventListener("message"');
    expect(worker).toContain("SKIP_WAITING");
    expect(worker).toMatch(/addEventListener\("message"[\s\S]{0,400}SKIP_WAITING/);
    expect(worker).not.toMatch(/addEventListener\("install"[\s\S]{0,400}self\.skipWaiting\(\)/);
  });

  it("provides both browser install handling and an explicit offline status surface", async () => {
    const source = await readFile(resolve(projectRoot, "client/src/components/PwaExperience.tsx"), "utf8");
    expect(source).toContain('beforeinstallprompt');
    expect(source).toContain('window.addEventListener("offline"');
    expect(source).toContain("payments and live updates are paused");
  });

  it("keeps the SAVANNA Ramabhadra wordmark in the supplied Gold color", async () => {
    const [shell, styles, html, db, orders, paymentCatalog, merchantStudio] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/components/SavannaShell.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/index.css"), "utf8"),
      readFile(resolve(projectRoot, "client/index.html"), "utf8"),
      readFile(resolve(projectRoot, "server/db.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/OrdersPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "server/payments/catalog.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/MerchantStudioPage.tsx"), "utf8"),
    ]);

    expect(shell).toContain('className="savanna-wordmark"');
    expect(shell).toContain(">Savanna</span>");
    expect(styles).toContain(".savanna-wordmark");
    expect(styles).toContain("color: var(--gold);");
    expect(styles).toContain(".dark .savanna-wordmark");
    expect(styles).toContain("color: var(--chat-gold);");
    expect(styles).not.toContain(".ember-wordmark");
    expect(styles).toContain('"Ramabhadra"');
    expect(html).toContain("family=Ramabhadra");
    expect(styles).toContain("--ivory: #FFFFFF;");
    expect(styles).toContain("--obsidian: #111B21;");
    expect(styles).toContain("--obsidian-surface: #202C33;");
    expect(styles).toContain("--warm-white: #E9EDEF;");
    expect(styles).toContain("--gold: #D9A441;");
    expect(styles).toContain("--bright-gold: #E8B64A;");
    expect(styles).toContain("--deep-gold: #A87820;");
    expect(styles).toContain("--success: #2F6B4F;");
    expect(styles).toContain("--processing: #E5A72E;");
    expect(styles).toContain("--info: #3E7FA8;");
    expect(styles).toContain("--error: #D85C5C;");
    expect(db).toContain("const avatarUrl = profile.userId === viewerUserId && profile.avatarKey ? await storageGetSignedUrl(profile.avatarKey) : null;");
    expect(db).toContain("export async function listPublicProducts(query?: string)");
    expect(db).toContain("eq(products.status, \"active\")");
    expect(db).toContain("export async function listPublicPreviewLessons(query?: string)");
    expect(db).toContain("eq(courseLessons.isPreview, true)");
    expect(orders).toContain('preparing: "savanna-order-status bg-[#FFFDF7] text-[#A87820]"');
    expect(orders).toContain('ready: "savanna-order-status bg-[#FFFDF7] text-[#53BDEB]"');
    expect(orders).toContain('completed: "savanna-order-status bg-[#FFFDF7] text-[#D9A441]"');
    expect(orders).toContain('cancelled: "savanna-order-status bg-[#FFFDF7] text-[#FF5B6B]"');
    expect(styles).toContain('[class~="bg-[#24482f]"],');
    expect(styles).toContain("background-color: #16231D !important;");
    expect(styles).toContain('[class~="hover:bg-[#1b3b25]"]:hover { background-color: #22352B !important; }');
    expect(styles).toContain('[class~="text-[#31583a]"],');
    expect(styles).toContain('[class~="text-[#213822]"]');
    expect(styles).toContain('[class~="text-[#263126]"]');
    expect(styles).toContain('[class~="text-[#354135]"]');
    expect(styles).toContain('[class~="text-[#313d31]"]');
    expect(styles).toContain('[class~="text-[#405340]"] { color: #5F6861 !important; }');
    expect(styles).toContain('[class~="text-[#496348]"] { color: #2F6B4F !important; }');
    expect(styles).toContain('.dark .savanna-app [class~="text-[#496348]"]');
    expect(paymentCatalog).toContain("Savanna will");
    expect(paymentCatalog).not.toContain("Ember will");
    expect(merchantStudio).toContain("disabled until Savanna has verified merchant eligibility, credentials, and its callback configuration");
    expect(merchantStudio).not.toContain("Ember");
  });

  it("provides a mobile Stories header and a familiar mobile chat-list hierarchy", async () => {
    const [shell, stories, messages, profile, styles, animatedIcons, shops, learn, orders, app] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/components/SavannaShell.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/components/StoriesPanel.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/MessagesPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/ProfilePage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/index.css"), "utf8"),
      readFile(resolve(projectRoot, "client/src/components/AnimatedNavIcons.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/ShopsPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/LearnPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/OrdersPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/App.tsx"), "utf8"),
    ]);

    expect(shell).toContain("<MobileStoriesHeader />");
    expect(shell).toContain('const mobileNavigation = navigation.filter((item) => item.href !== "/profile");');
    expect(shell).toContain("navigation.map((item) =>");
    expect(shell).toContain("mobileNavigation.map((item) =>");
    expect(shell).toContain('{ href: "/profile", label: "Profile" }');
    expect(shell).toContain('import { AnimatedPlusIcon, MobileNavIcon, type MobileNavIconName } from "@/components/AnimatedNavIcons";');
    expect(shell).toContain('<MobileNavIcon name={item.label as MobileNavIconName} active={active} size={22} />');
    expect(shell).toContain('<MobileNavIcon name={item.label as MobileNavIconName} active={active} size={21} />');
    expect(shell).not.toContain('{ href: "/", label: "Home", icon: Home }');
    expect(stories).toContain("const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop");
    expect(stories).toContain("setCompact(previewCompact || scrollTop > 12)");
    expect(stories).toContain("window.requestAnimationFrame");
    expect(stories).toContain("const collapsedStoriesCluster = compact ?");
    expect(stories).toContain("const ownStoryInitial =");
    expect(stories).toContain("return storyColors[Math.abs(id) % storyColors.length];");
    expect(stories).toContain("trpc.account.profile.useQuery");
    expect(stories).toContain("const ownStoryAvatarUrl = ownProfile.data?.avatarUrl ?? null;");
    expect(stories).toContain('aria-label="Add to your Story"');
    expect(stories).toContain('<img src={ownStoryAvatarUrl} alt="" className="size-full rounded-full object-cover" />');
    expect(stories).toContain('absolute -bottom-0.5 -right-0.5 grid size-5');
    expect(stories).not.toContain("Preview Stories — development only");
    expect(styles).not.toContain("border: 1px dashed");
    expect(stories).toContain('const previewStoriesEnabled = import.meta.env.DEV && !stories.data?.length');
    expect(stories).toContain('compact ? "hidden" : "block"');
    expect(stories).not.toContain('text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Stories</p>');
    expect(stories).toContain("const expandedHeight = Math.min(116, 78 + pull)");
    expect(stories).toContain("<header className=\"savanna-mobile-header savanna-glass-header fixed inset-x-0 top-0 z-40");
    expect(stories).toContain("className={`savanna-glass-stories-row overflow-hidden");
    expect(shell).toContain("savanna-glass-header hidden h-[76px]");
    expect(shell).toContain("savanna-mobile-bottom-nav savanna-glass-bottom-nav");
    expect(styles).toContain(".savanna-app .savanna-glass-header");
    expect(styles).toContain(".savanna-app .savanna-glass-bottom-nav");
    expect(styles).toContain("backdrop-filter: saturate(180%) blur(24px);");
    expect(styles).not.toContain("inset 0 1px 0 rgba(255, 255, 255, 0.66)");
    expect(stories).toContain("savanna-mobile-header-spacer lg:hidden");
    expect(stories).toContain('href="/profile" aria-label="Open profile"');
    expect(stories).toContain("{ownStoryAvatarUrl ? <img src={ownStoryAvatarUrl}");
    expect(stories).toContain("<UserIcon size={21} />");
    expect(stories).not.toContain('const [menuPulse, setMenuPulse] = useState(0);');
    expect(stories).toContain('const [searchPulse, setSearchPulse] = useState(0);');
    expect(stories).not.toContain('onPointerDown={() => setMenuPulse(current => current + 1)}');
    expect(stories).not.toContain('AnimatedMenuIcon className="size-5" size={20} pulse={menuPulse}');
    expect(stories).not.toContain('aria-label="Notifications"');
    expect(stories).not.toContain('Switch to ${theme');
    expect(stories).toContain("flex shrink-0 flex-col items-center gap-1");
    expect(stories).toContain("const groupedStories = useMemo");
    expect(stories).toContain("Open ${group.authorName}'s Stories");
    expect(stories).toContain('aria-label="Collapsed Stories cluster"');
    expect(stories).toContain('className="savanna-collapsed-story-cluster flex shrink-0 items-center"');
    expect(stories).toContain('text-[#5f6861] dark:text-[#9AA1A6]">Your Story</span>');
    expect(stories).toContain('text-[#5f6861] dark:text-[#9AA1A6]">{group.authorName.split(" ")[0]}</span>');
    expect(stories).toContain("groupedStories.slice(0, 3).map");
    expect(stories).toContain("grid size-8 shrink-0 place-items-center rounded-full");
    expect(stories).toContain('groupIndex ? "-ml-2" : ""');
    expect(stories).toContain("Previous Story");
    expect(stories).toContain("Next Story");
    expect(stories).toContain("aria-label={`Story ${activeStoryIndex + 1} of ${activeGroup.items.length}`}");
    expect(stories).toContain("Share a Story");
    expect(stories).not.toContain("from the desktop panel for now");
    expect(messages).toContain("Search chats or people");
    expect(messages).toContain("Create a chat tab");
    expect(messages).toContain("const filterTabs = ([['all', 'All'], ['direct', 'Chats'], ['group', 'Groups'], ['merchant_support', 'Support']] as const);");
    expect(messages).toContain("savanna-message-tab-membership");
    expect(messages).toContain("setMobileDetail(true)");
    expect(messages).toContain("DrawerContent");
    expect(messages).not.toContain('id="savanna-new-chat"');
    expect(messages).toContain("bottom-[calc(5.5rem+env(safe-area-inset-bottom))]");
    expect(messages).toContain('mx-2 mt-2 flex h-11 items-center gap-2 rounded-2xl');
    expect(messages).toContain('overflow-x-auto px-3 pb-1');
    expect(messages).toContain('savanna-mobile-messages-canvas -mx-4');
    expect(messages).not.toContain(">Chats</h1>");
    expect(messages).toContain("const previewConversations = [");
    expect(messages).toContain('const chatPreviewMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("chatPreview") : null;');
    expect(messages).toContain('useState(chatPreviewMode === "drawer")');
    expect(messages).toContain('if (conversation.id < 0) { if (import.meta.env.DEV) { setSelectedConversationId(conversation.id); if (isMobile) setMobileDetail(true); return; } return toast.info("Development preview chat — no real conversation opened"); }');
    expect(styles).toContain(".savanna-app main [class*=\"rounded-[28px]\"][class*=\"border\"]");
    expect(styles).toContain("border: 0 !important;");
    expect(messages).toContain("Development preview chat — no real conversation opened");
    expect(messages).toContain('if (status === "delivered" || status === "read") return <AnimatedCheckCheckIcon size={13} aria-label="Delivered" />;');
    expect(styles).toContain("--chat-read-blue: #53BDEB");
    expect(messages).toContain('previewStatus: "failed" as const');
    expect(messages).toContain('aria-label="Sent"');
    expect(messages).toContain('aria-label="Failed"');
    expect(messages).toContain('AnimatedCheckCheckIcon size={13} aria-label="Delivered"');
    expect(messages).toContain('AnimatedSearchIcon size={16}');
    expect(messages).toContain('AnimatedPlusIcon size={16}');
    expect(messages).toContain('AnimatedPlusIcon size={20}');
    expect(messages).toContain('text-[#5f6861] dark:text-[#9AA1A6]');
    expect(stories).toContain('onPointerDown={() => setSearchPulse(current => current + 1)}');
    expect(stories).toContain('AnimatedSearchIcon className="size-5" size={20} pulse={searchPulse}');
    expect(animatedIcons).toContain("export function AnimatedCheckCheckIcon");
    expect(animatedIcons).toContain("export function AnimatedPlusIcon");
    expect(animatedIcons).toContain("export function AnimatedSearchIcon");
    expect(animatedIcons).toContain("export function AnimatedMenuIcon");
    expect(animatedIcons).toContain("export function AnimatedStoreIcon");
    expect(animatedIcons).toContain("const UserIcon = forwardRef");
    expect(animatedIcons).toContain("const ShoppingBasketIcon = forwardRef");
    expect(animatedIcons).toContain("const BookTextIcon = forwardRef");
    expect(animatedIcons).toContain("export function AnimatedBookOpenTextIcon");
    expect(animatedIcons).toContain("export function AnimatedShoppingBagIcon");
    expect(animatedIcons).toContain('export { ShoppingBasketIcon, UserIcon };');
    expect(animatedIcons).toContain('export { BookTextIcon };');
    expect(animatedIcons).toContain('return <BookTextIcon size={size} {...props} />;');
    expect(animatedIcons).toContain('if (name === "Learn")');
    expect(animatedIcons).toContain('if (name === "Profile")');
    expect(animatedIcons).toContain('useAnimationControls');
    expect(animatedIcons).toContain('const [hovered, setHovered] = useState(false);');
    expect(animatedIcons).toContain('onPointerEnter: () => setHovered(true)');
    expect(animatedIcons).toContain('controls.start("active").then(() => controls.start("idle"));');
    expect(animatedIcons).toContain('initial="idle" animate={state}');
    expect(profile).toContain("Choose how Savanna looks on this device.");
    expect(profile).toContain("Use {theme === \"light\" ? \"dark\" : \"light\"} mode");
    expect(profile).toContain('className="savanna-profile-page mx-auto max-w-[910px] space-y-6"');
    expect(styles).toContain("#2A3942");
    expect(styles).toContain("--chat-bg: #0A1014");
    expect(styles).toContain("--chat-surface: #131A1E");
    expect(styles).toContain("--chat-search: #23282C");
    expect(styles).toContain("--chat-gold: #D9A441");
    expect(styles).toContain("--chat-gold-dark: #A87820");
    expect(styles).toContain("--chat-read-blue: #53BDEB");
    expect(styles).toContain("--chat-alert-red: #FF5B6B");
    expect(styles).toContain('[role="tablist"] [role="tab"][aria-selected="true"]');
    expect(styles).toContain('nav[aria-label="Mobile navigation"] {\n    background-color: var(--chat-bg) !important;');
    expect(styles).toContain('nav[aria-label="Mobile navigation"] [class~="text-[#8a765d]"]');
    expect(styles).toContain("background-color: color-mix(in srgb, var(--chat-gold-dark) 20%, transparent) !important;");
    expect(styles).toContain("border: 0.5px solid color-mix(in srgb, var(--chat-gold) 50%, transparent) !important;");
    expect(styles).toContain("border: 0.5px solid var(--chat-border) !important;");
    expect(shell).toContain('active ? "bg-[#D9A441]/20 text-[#A87820] dark:text-[#D9A441]"');
    expect(shell).toContain('active ? "inline-flex w-auto min-w-[92px] gap-2 rounded-[28px] bg-[#D9A441]/20 px-3 text-[#D9A441] dark:text-[#D9A441]"');
    expect(shell).toContain('savanna-mobile-bottom-nav savanna-glass-bottom-nav fixed bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-1/2 z-50 flex h-[60px] w-[min(calc(100vw-1.5rem),430px)] items-center rounded-[34px] px-4');
    expect(shell).toContain(': "w-11 rounded-[28px] text-[#8a765d]"');
    expect(styles).toContain('.dark .savanna-app .savanna-mobile-messages-canvas');
    expect(styles).toContain('.dark .savanna-app .savanna-mobile-header,\n  .dark .savanna-app .savanna-mobile-header > section');
    expect(styles).toContain('.savanna-app .savanna-mobile-header {\n    position: fixed !important;');
    expect(styles).toContain('.savanna-app .savanna-mobile-bottom-nav {\n    position: fixed !important;');
    expect(styles).toContain('label:has(input[aria-label="Search chats or people"])');
    expect(styles).toContain("border-radius: 9999px !important;");
    expect(styles).toContain('label:has(input[aria-label="Search chats or people"]) svg');
    expect(styles).toContain('label:has(input[aria-label="Search chats or people"]) input::placeholder');
    expect(styles).toContain("header[class*=\"sticky\"] .story-rail > div > span");
    expect(styles).toContain("color: var(--chat-text-secondary) !important;");
    expect(styles).toContain(".savanna-app nav[aria-label=\"Mobile navigation\"]");
    expect(styles).toContain(".dark .savanna-app .savanna-route-shops");
    expect(styles).toContain(".dark .savanna-app .savanna-route-learn");
    expect(styles).toContain(".dark .savanna-app .savanna-route-orders");
    expect(styles).toContain(".dark .savanna-app .savanna-profile-page");
    expect(styles).toContain(".dark .savanna-new-chat-drawer");
    expect(styles).toContain(".dark .savanna-app .savanna-desktop-messages");
    expect(styles).toContain(".savanna-desktop-message-tabs button[data-active=\"true\"]");
    expect(styles).toContain(".savanna-order-status");
    expect(shops).toContain("savanna-route-shops");
    expect(shops).toContain("AnimatedStoreIcon");
    expect(shops).toContain("AnimatedSearchIcon size={17}");
    expect(shops).toContain('const SHOPPING_BANNER_URL = "/shops_banner.png"');
    expect(shops).toContain("Featured products");
    expect(shops).toContain("Newest active listings");
    expect(shops).toContain('aria-label="Shop discovery filters"');
    expect(shops).toContain("trpc.commerce.storefronts.products.useQuery");
    expect(learn).toContain("savanna-route-learn");
    expect(learn).toContain("AnimatedBookOpenTextIcon");
    expect(learn).toContain("AnimatedSearchIcon size={17}");
    expect(learn).toContain('const LEARN_BANNER_URL = "/learn_banner.png"');
    expect(learn).toContain("Featured courses");
    expect(learn).toContain("Paid courses");
    expect(learn).toContain("Preview lessons");
    expect(learn).toContain("Only creator-enabled previews");
    expect(learn).toContain('aria-label="Learning discovery filters"');
    expect(learn).toContain("trpc.learning.courses.previewLessons.useQuery");
    expect(styles).toContain(".savanna-discovery-banner");
    expect(styles).toContain(".savanna-discovery-tabs button[data-active=\"true\"]");
    expect(orders).toContain("savanna-route-orders");
    expect(orders).toContain("AnimatedShoppingBagIcon size={18}");
    expect(orders).toContain('ready: "savanna-order-status bg-[#FFFDF7] text-[#53BDEB]"');
    expect(orders).toContain('cancelled: "savanna-order-status bg-[#FFFDF7] text-[#FF5B6B]"');
    expect(messages).toContain('className="savanna-new-chat-drawer rounded-t-[28px]');
    expect(messages).toContain("savanna-new-chat-tabs");
    expect(messages).toContain("savanna-desktop-messages grid min-h-screen lg:grid-cols-[470px_minmax(0,1fr)]");
    expect(messages).toContain("data-active={selectedConversationId === conversation.id}");
    expect(styles).toContain("border-right: 1px solid var(--chat-border) !important;");
    expect(styles).toContain(".savanna-desktop-chat-rows .savanna-chat-row[data-active=\"true\"]");
    expect(styles).toContain(".dark .savanna-app .savanna-chat-row {");
    expect(styles).toContain(".savanna-app .savanna-collapsed-story-cluster button + button");
    expect(messages).toContain('aria-label="Desktop chat filters"');
    expect(messages).toContain("const filteredChatList = filteredConversations.filter");
    expect(messages).toContain('AnimatedPlusIcon size={16}');
    expect(messages).toContain('text-[#FF5B6B]');
    expect(app).toContain('<Route path="/home" component={Home} />');
    expect(app).toContain('<Route path="/"><Redirect to="/messages" /></Route>');
    expect(messages).toContain("const desktopPreviewMessages = [");
    expect(messages).toContain('const isPreviewConversation = import.meta.env.DEV && (selectedConversationId ?? 0) < 0;');
    expect(messages).toContain('if (import.meta.env.DEV && isMobile && chatPreviewMode === "detail") setSelectedConversationId(previewConversations[0].id);');
    expect(messages).toContain('if (import.meta.env.DEV) { setSelectedConversationId(conversation.id); if (isMobile) setMobileDetail(true); return; }');
    expect(messages).toContain('Development preview — messages are not sent or saved.');
    expect(messages).toContain('savanna-wordmark text-[28px]');
    expect(messages).toContain('AnimatedSendIcon size={18}');
    expect(styles).toContain('.savanna-app .savanna-desktop-chat-list .savanna-wordmark');
    expect(styles).toContain('font-size: 28px;');
    expect(styles).toContain('.savanna-app .savanna-desktop-chat-search');
    expect(styles).toContain('.dark .savanna-app .savanna-desktop-chat-rows .savanna-chat-row[data-active="true"]');
    expect(styles).toContain('background: var(--chat-search) !important;');
    expect(styles).toContain('border-radius: 1rem !important;');
    expect(styles).toContain('.dark .savanna-app .savanna-incoming-message {\n    background: var(--chat-search) !important;');
    expect(styles).toContain('.dark .savanna-app .savanna-mobile-conversation .savanna-incoming-message {\n    background: var(--chat-search) !important;');
    expect(styles).toContain('.dark .savanna-app .savanna-mobile-conversation-header');
    expect(animatedIcons).toContain('export function AnimatedSendIcon');
    expect(animatedIcons).toContain('className={cn("inline-flex items-center justify-center", className)}');
    expect(animatedIcons).toContain('style={{ color, transform: "rotate(-45deg)", ...style }}');
    expect(animatedIcons).toContain('onMouseEnter={handleEnter}');
    expect(animatedIcons).toContain('x: [0, 6, 20, -20, 0]');
  });

  // Regression guard: the mobile /messages layout must mirror the desktop
  // web layout in light mode — white list surface, cream search pill, warm
  // bottom-nav tint, and a glass bottom nav that actually reads as colored.
  it("renders mobile /messages surfaces the same way as the desktop web version", async () => {
    const [styles, messages] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/index.css"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/MessagesPage.tsx"), "utf8"),
    ]);

    // Both list surfaces are white in light mode (desktop chat-list panel
    // and the mobile messages canvas share the same rule).
    expect(styles).toMatch(
      /:root:not\(\.dark\) \.savanna-app \.savanna-mobile-messages-canvas,[\s\S]*?\{[\s\S]*?background:\s*#FFFFFF\s*!important/
    );

    // The mobile search sits in the cream group next to the desktop search
    // — same color, no mobile-specific override that would deviate from web.
    const creamGroup = styles.match(
      /:root:not\(\.dark\) \.savanna-app \.savanna-desktop-chat-search,[\s\S]*?\{[\s\S]*?\}/
    );
    expect(creamGroup).not.toBeNull();
    expect(creamGroup?.[0]).toContain(".savanna-mobile-chat-search");
    expect(creamGroup?.[0]).toContain("background: #F6F5F5 !important");

    // The label and input must not carry hard-coded white that would override
    // the cream group (the earlier regression did exactly this).
    const mobileSearch = messages.match(
      /<input[\s\S]*?aria-label="Search chats or people"[\s\S]*?className="([^"]+)"/
    );
    expect(mobileSearch).not.toBeNull();
    expect(mobileSearch?.[1]).not.toContain("bg-white");
    expect(mobileSearch?.[1]).toContain("bg-transparent");
    // No inline style either.
    const mobileLabel = messages.match(
      /<label className="savanna-mobile-chat-search[^"]*" style=\{\{[^}]*\}\}>/
    );
    expect(mobileLabel).toBeNull();

    // Bottom nav stays glassy while its light-mode base is white.
    expect(styles).toMatch(
      /:root:not\(\.dark\) \.savanna-app nav\.savanna-mobile-bottom-nav\.savanna-glass-bottom-nav \{[\s\S]*?background:\s*color-mix\(in srgb,\s*#FFFFFF [^,]+,\s*transparent\)/
    );

    // The mobile and desktop message threads stay white in light mode.
    expect(styles).toMatch(
      /:root:not\(\.dark\) \.savanna-app \.savanna-desktop-message-thread,[\s\S]*?savanna-mobile-message-thread\s*\{[\s\S]*?background:\s*#FFFFFF\s*!important/
    );

    // No rule may lump the bottom nav together with the chat search.
    expect(styles).not.toMatch(
      /:is\(\s*[^)]*savanna-mobile-bottom-nav[^)]*savanna-mobile-chat-search/s
    );
  });

  // Regression guard: the glass header and glass bottom nav must stay flat in
  // BOTH themes — no drop shadow, no inset highlight. Split the stylesheet into
  // rule blocks and assert every glass-chrome rule is explicitly shadow-free.
  it("keeps the glass header and bottom nav free of box-shadow in both themes", async () => {
    const styles = await readFile(resolve(projectRoot, "client/src/index.css"), "utf8");

    const glassRules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(match => ({ selector: match[1].trim(), body: match[2] }))
      .filter(rule => /savanna-glass-(header|bottom-nav)/.test(rule.selector));

    expect(glassRules.length).toBeGreaterThan(0);

    for (const rule of glassRules) {
      const shadow = rule.body.match(/box-shadow:\s*([^;]+)/);
      if (!shadow) continue;
      expect(
        shadow[1].trim(),
        `glass chrome rule must not cast a shadow: ${rule.selector}`
      ).toBe("none !important");
    }

    // Belt and braces: none of the old shadow values may survive anywhere.
    for (const value of [
      "0 16px 44px rgba(21, 26, 23, 0.1)",
      "0 -18px 48px rgba(21, 26, 23, 0.13)",
      "0 18px 48px rgba(21, 26, 23, 0.14)",
      "0 18px 38px rgba(21, 26, 23, 0.16)",
      "0 16px 44px rgba(5, 10, 14, 0.42)",
      "0 -18px 48px rgba(5, 10, 14, 0.48)",
    ]) {
      expect(styles).not.toContain(value);
    }

    // The blur/tint treatment itself must survive — we removed shadows, not glass.
    expect(styles).toContain("backdrop-filter: saturate(180%) blur(24px);");
    expect(styles).toContain("backdrop-filter: saturate(190%) blur(28px);");
    expect(styles).toMatch(
      /:root:not\(\.dark\) \.savanna-app nav\.savanna-mobile-bottom-nav\.savanna-glass-bottom-nav \{[\s\S]*?box-shadow:\s*none\s*!important/
    );
    expect(styles).toMatch(
      /:root:not\(\.dark\) \.savanna-app nav\.savanna-mobile-bottom-nav\.savanna-glass-bottom-nav \{[\s\S]*?border:\s*1px solid/
    );
    expect(styles).toMatch(
      /\.dark \.savanna-app nav\.savanna-mobile-bottom-nav\.savanna-glass-bottom-nav \{[\s\S]*?box-shadow:\s*none\s*!important/
    );
    expect(styles).toMatch(
      /\.dark \.savanna-app nav\.savanna-mobile-bottom-nav\.savanna-glass-bottom-nav \{[\s\S]*?border:\s*1px solid/
    );
  });
});
