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

  it("offers Google sign-in as a no-SMS Firebase Auth path", async () => {
    const [login, googleAuth] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/pages/LoginPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/googleAuth.ts"), "utf8"),
    ]);

    expect(googleAuth).toContain("GoogleAuthProvider");
    expect(googleAuth).toContain("signInWithPopup");
    expect(googleAuth).toContain("signInWithRedirect");
    expect(login).toContain("Continue with Gmail");
    expect(login).toContain("signInWithGoogle");
    expect(login).toContain("Phone sign-in may require Firebase billing");
    expect(login).toContain("bg-[#D9A441]/20 text-[#D9A441]");
  });

  it("keeps phone numbers out of public username lookup while starting chats by @username", async () => {
    const [userProfile, firebaseChat, messages, profile, publicProfile, firestoreRules] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/lib/userProfile.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/firebaseChat.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/MessagesPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/ProfilePage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/PublicProfilePage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "firestore.rules"), "utf8"),
    ]);

    expect(userProfile).toContain("publicProfiles");
    expect(userProfile).toContain("usernames");
    expect(userProfile).toContain("follows");
    expect(userProfile).toContain("isFollowingUser");
    expect(userProfile).toContain("followUser");
    expect(userProfile).toContain("unfollowUser");
    expect(userProfile).toContain("listFollowedUserIds");
    expect(userProfile).toContain("useFollowedUserIds");
    expect(userProfile).toContain('"users", followerUid, "following", followingUid');
    expect(userProfile).toContain("searchUserProfilesByUsername");
    expect(userProfile).toContain("runTransaction");
    expect(userProfile).toContain("phoneNumber: null");
    expect(firebaseChat).toContain('doc(db, "conversations", `direct_${memberIds.join("__")}`)');
    expect(firebaseChat).toContain('directKey: kind === "direct" ? memberIds.join("__") : null');
    expect(firebaseChat).toContain('throw new Error("Choose another user to start a chat.")');
    expect(firebaseChat).toContain('"users", memberId, "conversationRefs"');
    expect(firebaseChat).toContain("conversationInboxQuery(user.id)");
    expect(firebaseChat).toContain('where("memberIds", "array-contains", uid)');
    expect(firebaseChat).toContain("onSnapshot(");
    expect(firebaseChat).toContain("writeBatch(db)");
    expect(firebaseChat).toContain(".sort((left, right) => new Date(right.lastMessageAt ?? 0).getTime()");
    expect(messages).toContain("username-search");
    expect(messages).toContain("searchUserProfilesByUsername");
    expect(messages).toContain("startChatWithProfile");
    expect(messages).toContain("locallyCreatedConversations");
    expect(messages).toContain("savanna-open-conversation");
    expect(messages).toContain("savanna-open-conversation-meta");
    expect(messages).toContain("memberIds: selected?.memberIds ?? []");
    expect(messages).toContain("@{profile.username}");
    expect(messages).toContain('<MobileNavIcon name="Messages" active size={18} />');
    expect(messages).toContain("That is your profile.");
    expect(messages).toContain('toast.success("Chat started")');
    expect(profile).toContain('id="profile-username"');
    expect(profile).toContain("Your phone number stays private.");
    expect(publicProfile).toContain("@{item.username}");
    expect(publicProfile).toContain("<SavannaShell hideMobileHeader hideDesktopHeader>");
    expect(publicProfile).toContain("savanna-public-profile-page");
    expect(publicProfile).toContain("savanna-public-profile-identity");
    expect(publicProfile).toContain("savanna-public-profile-tabs");
    expect(publicProfile).toContain("savanna-public-profile-grid");
    expect(publicProfile).toContain("followMutation");
    expect(publicProfile).toContain("startMessage");
    expect(publicProfile).toContain("{!isOwnProfile ? (");
    expect(publicProfile).toContain('sessionStorage.setItem("savanna-open-conversation"');
    expect(publicProfile).toContain("Following");
    expect(publicProfile).not.toContain("savanna-public-profile-card");
    expect(publicProfile).not.toContain("Follower");
    expect(publicProfile).not.toContain("followers");
    expect(publicProfile).not.toContain('href="/messages" aria-label={`Message ${displayName}`}');
    expect(firestoreRules).toContain("match /publicProfiles/{uid}");
    expect(firestoreRules).toContain("match /usernames/{usernameLower}");
    expect(firestoreRules).toContain("match /follows/{followId}");
    expect(firestoreRules).toContain("match /following/{followingUid}");
    expect(firestoreRules).toContain("request.resource.data.followerUserId == request.auth.uid");
    expect(firestoreRules).toContain("match /conversationRefs/{conversationId}");
    expect(firestoreRules).toContain("request.resource.data.conversationId == conversationId");
    expect(firestoreRules).toContain("'senderId', 'memberIds', 'body'");
    expect(firestoreRules).toContain("request.resource.data.memberIds == conversationRef(conversationId).data.memberIds");
    expect(firestoreRules).toContain("function validConversationCreate()");
    expect(firestoreRules).toContain("'directKey'");
    expect(firestoreRules).toContain("request.resource.data.memberIds.size() == 2");
    expect(firestoreRules).toContain("allow read: if isSelf(uid);");

    const publicProfileRuleBlock = firestoreRules.slice(
      firestoreRules.indexOf("match /publicProfiles/{uid}"),
      firestoreRules.indexOf("match /usernames/{usernameLower}"),
    );
    expect(publicProfileRuleBlock).not.toContain("phoneNumber");
    expect(publicProfileRuleBlock).not.toContain("email");
  });

  // Security rules are not filters: a `list` query is checked against the
  // query's constraints, not against the documents. Firestore can prove
  // `uid in memberIds` from messagesQuery()'s array-contains filter, but it
  // cannot prove a standalone `memberIds is list` type test from it — so that
  // extra clause evaluates to false and denies the thread to its own members.
  // Symptom in the browser: sends succeed, nothing ever renders.
  it("never guards the message read rule with a type test the query cannot satisfy", async () => {
    const firestoreRules = await readFile(resolve(projectRoot, "firestore.rules"), "utf8");

    const messagesBlock = firestoreRules.slice(firestoreRules.indexOf("match /messages/{messageId}"));
    const readRule = messagesBlock.slice(
      messagesBlock.indexOf("allow read:"),
      messagesBlock.indexOf("allow create:"),
    );

    expect(messagesBlock).not.toBe("");
    expect(readRule).not.toBe("");
    // Membership must still be enforced — just not via a clause that breaks it.
    expect(readRule).toContain("request.auth.uid in resource.data.memberIds");
    expect(readRule).not.toContain("is list");

    // Writes are single-document, where rules do see the real payload, so the
    // type guard on create is both provable and worth keeping.
    const createRule = messagesBlock.slice(
      messagesBlock.indexOf("allow create:"),
      messagesBlock.indexOf("allow update:"),
    );
    expect(createRule).toContain("request.resource.data.memberIds is list");
  });

  it("syncs the browser status bar color with the active theme", async () => {
    const themeContext = await readFile(resolve(projectRoot, "client/src/contexts/ThemeContext.tsx"), "utf8");

    expect(themeContext).toContain('const themeColor = theme === "dark" ? "#111B21" : "#FFFFFF";');
    expect(themeContext).toContain('document.querySelector<HTMLMetaElement>(\'meta[name="theme-color"]\')');
    expect(themeContext).toContain("themeMeta.content = themeColor");
    expect(themeContext).toContain("document.body.style.backgroundColor = themeColor");
  });

  it("keeps the SAVANNA Ramabhadra wordmark in the supplied Gold color", async () => {
    const [shell, styles, html, db, orders, storiesPage, paymentCatalog, merchantStudio] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/components/SavannaShell.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/index.css"), "utf8"),
      readFile(resolve(projectRoot, "client/index.html"), "utf8"),
      readFile(resolve(projectRoot, "server/db.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/OrdersPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/StoriesPage.tsx"), "utf8"),
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
    expect(styles).toContain("--success: #D9A441;");
    expect(styles).toContain("--processing: #E5A72E;");
    expect(styles).toContain("--info: #3E7FA8;");
    expect(styles).toContain("--error: #D85C5C;");
    expect(db).toContain("const avatarUrl = await signedUrlOrNull(profile.avatarKey);");
    expect(db).toContain("export async function listPublicProducts(query?: string, userId?: number | null)");
    expect(db).toContain("export async function listPublicProductMemories(query?: string, userId?: number | null)");
    expect(db).toContain("eq(products.status, \"active\")");
    expect(db).toContain("export async function listPublicPreviewLessons(query?: string)");
    expect(db).toContain("eq(courseLessons.isPreview, true)");
    expect(orders).toContain('preparing: "savanna-order-status bg-[#FFFDF7] text-[#A87820]"');
    expect(orders).toContain('ready: "savanna-order-status bg-[#FFFDF7] text-[#53BDEB]"');
    expect(orders).toContain('completed: "savanna-order-status bg-[#FFFDF7] text-[#D9A441]"');
    expect(orders).toContain('cancelled: "savanna-order-status bg-[#FFFDF7] text-[#FF5B6B]"');
    expect(storiesPage).toContain("savanna-route-stories");
    expect(storiesPage).toContain("StoryDiscoveryTab");
    expect(storiesPage).toContain("StoryAdContext");
    expect(styles).toContain('[class~="bg-[#24482f]"],');
    expect(styles).toContain("background-color: #D9A441 !important;");
    expect(styles).toContain('[class~="hover:bg-[#1b3b25]"]:hover { background-color: #E8B64A !important; }');
    expect(styles).toContain('[class~="text-[#31583a]"],');
    expect(styles).toContain('[class~="text-[#213822]"]');
    expect(styles).toContain('[class~="text-[#263126]"]');
    expect(styles).toContain('[class~="text-[#354135]"]');
    expect(styles).toContain('[class~="text-[#313d31]"]');
    expect(styles).toContain('[class~="text-[#405340]"] { color: #5F6861 !important; }');
    expect(styles).toContain('[class~="text-[#496348]"] { color: #D9A441 !important; }');
    expect(styles).toContain('.dark .savanna-app [class~="text-[#496348]"]');
    expect(paymentCatalog).toContain("Savanna will");
    expect(paymentCatalog).not.toContain("Ember will");
    expect(merchantStudio).toContain("disabled until Savanna has verified merchant eligibility, credentials, and its callback configuration");
    expect(merchantStudio).not.toContain("Ember");
  });

  it("provides a mobile Stories header and a familiar mobile chat-list hierarchy", async () => {
    const [
      shell,
      stories,
      messages,
      profile,
      styles,
      animatedIcons,
      shops,
      learn,
      orders,
      storiesPage,
      app,
      firebaseStories,
      firebaseShops,
      firebaseChat,
      firestoreRules,
      storageRules,
      firestoreIndexes,
    ] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/components/SavannaShell.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/components/StoriesPanel.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/MessagesPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/ProfilePage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/index.css"), "utf8"),
      readFile(resolve(projectRoot, "client/src/components/AnimatedNavIcons.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/ShopsPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/LearnPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/OrdersPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/StoriesPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/App.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/firebaseStories.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/firebaseShops.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/firebaseChat.ts"), "utf8"),
      readFile(resolve(projectRoot, "firestore.rules"), "utf8"),
      readFile(resolve(projectRoot, "storage.rules"), "utf8"),
      readFile(resolve(projectRoot, "firestore.indexes.json"), "utf8"),
    ]);

    expect(shell).toContain("<MobileStoriesHeader />");
    expect(shell).toContain("const mobileNavigation = navigation;");
    expect(shell).toContain("navigation.map((item) =>");
    expect(shell).toContain("mobileNavigation.map((item) =>");
    expect(shell).toContain('{ href: "/stories", label: "Stories" }');
    expect(shell).toContain('{ href: "/profile", label: "Profile" }');
    expect(shell).not.toContain('{ href: "/orders", label: "Orders" }');
    expect(shell).toContain('import { AnimatedPlusIcon, MobileNavIcon, type MobileNavIconName } from "@/components/AnimatedNavIcons";');
    expect(shell).toContain('<MobileNavIcon name={item.label as MobileNavIconName} active={active} size={22} />');
    expect(shell).toContain('<MobileNavIcon name={item.label as MobileNavIconName} active={active} size={21} />');
    expect(shell).not.toContain('{ href: "/", label: "Home", icon: Home }');
    expect(stories).toContain("const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop");
    expect(stories).toContain("setCompact(previewCompact || scrollTop > 12)");
    expect(stories).toContain("window.requestAnimationFrame");
    expect(stories).toContain("const collapsedStoriesCluster = compact ?");
    expect(stories).toContain("const ownStoryInitial =");
    expect(stories).toContain("return storyColors[Math.abs(value) % storyColors.length];");
    expect(stories).toContain("useFirebaseStories(user, true)");
    expect(stories).toContain("filterStoriesForFollowingHeader");
    expect(stories).toContain("useFollowedUserIds");
    expect(stories).toContain("usePublishFirebaseStory");
    expect(stories).toContain("useReactToFirebaseStory");
    expect(stories).toContain("useReplyToFirebaseStory");
    expect(stories).toContain("useViewFirebaseStory");
    expect(stories).not.toContain("trpc.stories");
    expect(stories).not.toContain("trpc.account.profile.useQuery");
    expect(stories).toContain("const ownStoryAvatarUrl = user?.photoURL ?? null;");
    expect(stories).toContain('aria-label="Add to your Story"');
    expect(stories).toContain('<img src={ownStoryAvatarUrl} alt="" className="size-full rounded-full object-cover" />');
    expect(stories).toContain('absolute -bottom-0.5 -right-0.5 grid size-5');
    expect(stories).not.toContain("Preview Stories — development only");
    expect(styles).not.toContain("border: 1px dashed");
    expect(stories).toContain('const previewStoriesEnabled = import.meta.env.DEV && !followingStories.length');
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
    expect(stories).not.toContain('href="/profile" aria-label="Open profile"');
    expect(stories).toContain("{ownStoryAvatarUrl ? <img src={ownStoryAvatarUrl}");
    expect(stories).not.toContain("<UserIcon size={21} />");
    expect(stories).not.toContain('const [menuPulse, setMenuPulse] = useState(0);');
    expect(stories).toContain('const [searchPulse, setSearchPulse] = useState(0);');
    expect(stories).not.toContain('onPointerDown={() => setMenuPulse(current => current + 1)}');
    expect(stories).not.toContain('AnimatedMenuIcon className="size-5" size={20} pulse={menuPulse}');
    expect(stories).not.toContain('aria-label="Notifications"');
    expect(stories).not.toContain('Switch to ${theme');
    expect(stories).toContain("flex shrink-0 flex-col items-center gap-1");
    expect(stories).toContain("const groupedStories = useMemo");
    expect(stories).toContain("Open ${group.authorName}'s Stories");
    expect(stories).toContain("story.discovery?.label");
    expect(stories).toContain("Around you Stories");
    expect(stories).toContain('aria-label="Collapsed Stories cluster"');
    expect(stories).toContain('className="savanna-collapsed-story-cluster flex shrink-0 items-center"');
    expect(stories).toContain('text-[#5f6861] dark:text-[#9AA1A6]">Your Story</span>');
    expect(stories).not.toContain("const discoveryLabel = group.items[0]?.discovery?.label");
    expect(stories).toContain('{group.authorName.split(" ")[0]}</span>');
    expect(stories).toContain("groupedStories.slice(0, 3).map");
    expect(stories).toContain("grid size-8 shrink-0 place-items-center rounded-full");
    expect(stories).toContain('groupIndex ? "-ml-1.5" : ""');
    expect(stories).toContain("Previous Story");
    expect(stories).toContain("Next Story");
    expect(stories).toContain("aria-label={`Story ${(index ?? 0) + 1} of ${total}`}");
    expect(stories).toContain("Share a Story");
    expect(stories).not.toContain("from the desktop panel for now");
    expect(animatedIcons).toContain('MobileNavIconName = "Home" | "Messages" | "Shops" | "Learn" | "Stories" | "Orders" | "Profile"');
    expect(animatedIcons).toContain('if (name === "Stories")');
    expect(animatedIcons).toContain("const movingLineVariants: Variants");
    expect(animatedIcons).toContain('y: [0, -4.5, 0, -4.5, 0]');
    expect(animatedIcons).toContain("variants={movingLineVariants}");
    expect(app).toContain('const StoriesPage = lazy(() => import("./pages/StoriesPage"));');
    expect(app).toContain('<Route path="/stories" component={StoriesPage} />');
    expect(storiesPage).toContain('type StoryDiscoveryTab = "for_you" | "near_you" | "following" | "shops" | "community";');
    expect(storiesPage).toContain("buildStoriesFeedItems");
    expect(storiesPage).toContain("StoryAdContext");
    expect(storiesPage).toContain("adsEnabled = false");
    expect(storiesPage).toContain("savanna-story-filter-pill");
    expect(storiesPage).toContain('activeTab === tab.value ? "border-[#D9A441]/30 bg-[#D9A441]/20 text-[#D9A441]"');
    expect(storiesPage).toContain("For You");
    expect(storiesPage).toContain("Near You");
    expect(storiesPage).toContain("Following");
    expect(storiesPage).toContain("Shops");
    expect(storiesPage).toContain("Community");
    expect(storiesPage).toContain("useCommentFirebaseStory");
    expect(storiesPage).toContain("useFirebaseStoryComments");
    expect(storiesPage).toContain("useReplyToFirebaseStory");
    expect(storiesPage).toContain("navigator.share");
    expect(storiesPage).toContain("Visit shop");
    expect(storiesPage).toContain("Contextual placement ready.");
    expect(messages).toContain("Search chats or people");
    expect(messages).toContain("Create a chat tab");
    expect(messages).toContain('const filterTabs = ([["all", "All"], ["direct", "Chats"], ["group", "Groups"], ["merchant_support", "Support"]] as const);');
    expect(messages).toContain("savanna-message-tab-membership");
    expect(messages).toContain("setMobileDetail(true)");
    expect(messages).toContain("DrawerContent");
    expect(messages).not.toContain('id="savanna-new-chat"');
    expect(messages).toContain("bottom-[calc(5.5rem+env(safe-area-inset-bottom))]");
    expect(messages).toContain('mx-2 mt-2 flex h-11 items-center gap-2 rounded-2xl');
    expect(messages).toContain('overflow-x-auto px-3 pb-1');
    expect(messages).toContain("savanna-mobile-chat-rows mt-3 divide-y-0 px-2");
    expect(messages).toContain('dark:bg-[#23282C] dark:text-[#D9A441]');
    expect(messages).toContain('savanna-mobile-messages-canvas -mx-4');
    expect(messages).not.toContain(">Chats</h1>");
    expect(messages).toContain("const previewConversations: ConversationListItem[] = [];");
    expect(messages).toContain("const desktopPreviewMessages: never[] = [];");
    expect(messages).toContain('const chatPreviewMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("chatPreview") : null;');
    expect(messages).toContain('useState(chatPreviewMode === "drawer")');
    expect(messages).toContain("useFirebaseConversations(user)");
    expect(messages).toContain("useFirebaseMessages(selectedConversationId");
    expect(messages).toContain("useFirebaseChatMutations(user)");
    expect(messages).toContain('id.startsWith("preview-")');
    expect(messages).toContain("if (isPreviewConversationId(conversation.id))");
    expect(styles).toContain(".savanna-app main [class*=\"rounded-[28px]\"][class*=\"border\"]");
    expect(styles).toContain("border: 0 !important;");
    expect(messages).toContain("Development preview chat - no real conversation opened");
    expect(messages).toContain('if (status === "delivered" || status === "read") return <AnimatedCheckCheckIcon size={13} aria-label="Delivered" />;');
    expect(styles).toContain("--chat-read-blue: #53BDEB");
    expect(messages).not.toContain('previewStatus: "failed"');
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
    expect(animatedIcons).toContain('const [pressed, setPressed] = useState(false);');
    expect(animatedIcons).toContain('const [canHover, setCanHover] = useState(false);');
    expect(animatedIcons).toContain("const pressTimer = useRef<number | null>(null);");
    expect(animatedIcons).toContain("const playPressAnimation = useCallback");
    expect(animatedIcons).toContain("pressTimer.current = window.setTimeout");
    expect(animatedIcons).toContain("}, 760);");
    expect(animatedIcons).toContain('const state = !reducedMotion && (hovered || pressed) ? "active" : "idle";');
    expect(animatedIcons).toContain('window.matchMedia("(hover: hover) and (pointer: fine)")');
    expect(animatedIcons).toContain('onPointerEnter: () => { if (canHover) setHovered(true); }');
    expect(animatedIcons).toContain('onPointerDown: () => { if (!canHover) playPressAnimation(); }');
    expect(animatedIcons).toContain('onTouchStart: () => { if (!canHover) playPressAnimation(); }');
    expect(animatedIcons).toContain("data-active={active}");
    expect(animatedIcons).toContain('controls.start("active").then(() => controls.start("idle"));');
    expect(animatedIcons).toContain('initial="idle" animate={state}');
    expect(profile).toContain("Choose how Savanna looks on this device.");
    expect(profile).toContain("Use {theme === \"light\" ? \"dark\" : \"light\"} mode");
    expect(profile).toContain("<SavannaShell hideMobileHeader>");
    expect(profile).toContain("savanna-profile-topbar savanna-glass-header");
    expect(profile).toContain("savanna-profile-header savanna-profile-hero");
    expect(profile).not.toContain(">View</Link>");
    expect(profile).toContain('className="savanna-profile-page mx-auto max-w-[960px] space-y-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8"');
    expect(profile).toContain("savanna-profile-switch");
    expect(profile).not.toContain('label: "Groups", icon: MessageCircle');
    expect(profile).not.toContain('label: "Stories", icon: KeyRound');
    expect(profile).toContain("savanna-username-field");
    expect(shell).toContain("hideMobileHeader?: boolean");
    expect(shell).toContain("hideDesktopHeader?: boolean");
    expect(shell).toContain("hideChrome || hideMobileHeader ? null : <MobileStoriesHeader />");
    expect(shell).toContain("!hideDesktopHeader && !usesIconRail");
    expect(styles).toContain(".savanna-app .savanna-profile-page .savanna-profile-card");
    expect(styles).toContain(".savanna-app .savanna-profile-page .savanna-profile-topbar");
    expect(styles).toContain(".savanna-app .savanna-profile-page .savanna-profile-header");
    expect(styles).toContain(".savanna-app .savanna-public-profile-page .savanna-public-profile-topbar");
    expect(styles).toContain(".savanna-app .savanna-public-profile-page .savanna-public-profile-identity");
    expect(styles).toContain(".savanna-app .savanna-public-profile-page .savanna-public-profile-grid");
    expect(styles).toContain("@media (max-width: 1023px)");
    expect(styles).toContain("env(safe-area-inset-top)");
    expect(styles).toContain(".savanna-app .savanna-profile-page .savanna-username-field input:focus-visible");
    expect(styles).toContain("outline: 0 !important;");
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
    expect(shell).toContain('active ? "inline-flex w-max min-w-max items-center gap-2 rounded-[28px] bg-[#D9A441]/20 px-3 text-[#D9A441] dark:text-[#D9A441]"');
    // `justify-between` anchors the end tabs, and every tab is `flex-none`: the
    // active one grows to fit its label, and a `flex-1` slot would hoard the
    // leftover space on one side.
    expect(shell).toContain('className="flex h-full flex-none items-center justify-center rounded-[28px] text-xs font-semibold"');
    expect(shell).toContain('className="whitespace-nowrap leading-none text-[#D9A441] dark:text-[#D9A441]"');
    expect(shell).toContain('savanna-mobile-bottom-nav savanna-glass-bottom-nav fixed bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-1/2 z-50 flex h-[60px] w-[min(calc(100vw-1.5rem),430px)] items-center justify-between rounded-[34px] px-2 py-2');

    // The `px-2` above is a LIE unless you read this rule too. A mobile
    // media-query block in index.css sets
    // `padding-left/right: 0.5rem !important` on `.savanna-mobile-bottom-nav`,
    // which beats the utility and is therefore the value that actually
    // renders. It must stay 0.5rem (8px) so the active pill's gap to the
    // rail's side edge equals the `py-2` gap to its top and bottom.
    // An earlier version of this rule used 1rem (16px), which silently
    // defeated every `px-*` utility tried on the element — the symptom was
    // "the end tabs never move no matter what I change".
    const bottomNavRule = styles.match(/\.savanna-app \.savanna-mobile-bottom-nav \{[^}]*\}/);
    expect(bottomNavRule).not.toBeNull();
    expect(bottomNavRule![0]).toContain('padding-right: 0.5rem !important');
    expect(bottomNavRule![0]).toContain('padding-left: 0.5rem !important');
    // Guard against reintroducing the 1rem inset that swallowed the utilities.
    expect(bottomNavRule![0]).not.toContain('1rem !important');
    expect(shell).toContain('"grid h-11 place-items-center transition-[width,background-color] duration-200"');
    expect(styles).toContain(".savanna-app .savanna-mobile-header .savanna-wordmark");
    expect(styles).toContain("font-size: 26px;");
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
    expect(styles).toContain(".dark .savanna-app .savanna-route-stories");
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
    expect(shops).toContain('["around", "Around you"]');
    expect(shops).toContain('["memories", "Memories"]');
    expect(shops).toContain("useFirebaseProductMemories");
    expect(shops).toContain("Short stories from shops");
    expect(shops).toContain("Newest active listings");
    expect(shops).toContain('aria-label="Shop discovery filters"');
    expect(shops).toContain("useFirebaseProducts");
    expect(shops).toContain("useFirebaseStorefronts");
    expect(shops).toContain("hasAroundYou");
    expect(firebaseStories).toContain('collection(db, "stories")');
    expect(firebaseStories).toContain('where("audience", "==", "custom"), where("customAudienceUserIds", "array-contains", user.id)');
    expect(firebaseStories).toContain('where("authorUserId", "==", authorUserId), where("audience", "==", "public")');
    expect(firebaseStories).toContain("uploadBytes(storageRef, input.file");
    expect(firebaseStories).toContain("getDownloadURL(storageRef)");
    expect(firebaseStories).toContain("replyToStoryInFirebase");
    expect(firebaseStories).toContain("filterStoriesForFollowingHeader");
    expect(firebaseStories).toContain("commentOnFirebaseStory");
    expect(firebaseStories).toContain("useFirebaseStoryComments");
    expect(firebaseStories).toContain("useCommentFirebaseStory");
    expect(firebaseShops).toContain('collection(getFirestoreDb(), "storefronts")');
    expect(firebaseShops).toContain('collection(getFirestoreDb(), "products")');
    expect(firebaseShops).toContain("useFirebaseStorefronts");
    expect(firebaseShops).toContain("useFirebaseProducts");
    expect(firebaseShops).toContain("useFirebaseProductMemories");
    expect(firebaseShops).toContain("useFirebaseShopMutations");
    expect(firebaseChat).toContain('collection(db, "conversations")');
    expect(firebaseChat).toContain("useFirebaseConversations");
    expect(firebaseChat).toContain("useFirebaseMessages");
    expect(firebaseChat).toContain("sendFirebaseAttachment");
    expect(firebaseChat).toContain("createSupportConversation");
    expect(firestoreRules).toContain("match /stories/{storyId}");
    expect(firestoreRules).toContain("match /comments/{commentId}");
    expect(firestoreRules).toContain("'userId', 'userName', 'userPhotoURL', 'body', 'createdAt'");
    expect(firestoreRules).toContain("match /storefronts/{storefrontId}");
    expect(firestoreRules).toContain("match /products/{productId}");
    expect(firestoreRules).toContain("match /orders/{orderId}");
    expect(firestoreRules).toContain("match /safetyReports/{reportId}");
    expect(firestoreRules).toContain("'storyId'");
    expect(storageRules).toContain("match /stories/{uid}/{allPaths=**}");
    expect(storageRules).toContain("match /shops/{uid}/{allPaths=**}");
    expect(firestoreIndexes).toContain('"collectionGroup": "stories"');
    expect(firestoreIndexes).toContain('"fieldPath": "customAudienceUserIds"');
    expect(firestoreIndexes).toContain('"fieldPath": "authorUserId"');
    expect(firestoreIndexes).toContain('"collectionGroup": "storefronts"');
    expect(firestoreIndexes).toContain('"collectionGroup": "products"');
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
    expect(styles).toContain(":is(.savanna-discovery-card, .savanna-discovery-empty)");
    expect(styles).toContain("background: #F6F5F5 !important;");
    expect(orders).toContain("savanna-route-orders");
    expect(orders).toContain("AnimatedShoppingBagIcon size={18}");
    expect(orders).toContain('ready: "savanna-order-status bg-[#FFFDF7] text-[#53BDEB]"');
    expect(orders).toContain('cancelled: "savanna-order-status bg-[#FFFDF7] text-[#FF5B6B]"');
    expect(messages).toContain('className="savanna-new-chat-drawer rounded-t-[28px]');
    expect(messages).toContain("savanna-new-chat-tabs");
    expect(messages).toContain("savanna-desktop-messages grid min-h-screen lg:grid-cols-[470px_minmax(0,1fr)]");
    expect(messages).toContain("const active = selectedConversationId === conversation.id;");
    expect(messages).toContain("data-active={active}");
    expect(styles).toContain("border-right: 1px solid var(--chat-border) !important;");
    expect(styles).toContain(".savanna-desktop-chat-rows .savanna-chat-row[data-active=\"true\"]");
    expect(styles).toContain(".dark .savanna-app .savanna-chat-row {");
    expect(styles).toContain(".dark .savanna-app .savanna-mobile-messages-canvas [role=\"tablist\"] [role=\"tab\"][aria-selected=\"true\"]");
    expect(styles).toContain(".savanna-app .savanna-collapsed-story-cluster button + button");
    expect(messages).toContain('aria-label="Desktop chat filters"');
    expect(messages).toContain("const filteredChatList = filteredConversations.filter");
    expect(messages).toContain('AnimatedPlusIcon size={16}');
    expect(messages).toContain('text-[#FF5B6B]');
    // `/home` used to render the Home page directly; it now redirects to
    // /messages, which is the app's landing route. Assert the redirect rather
    // than the old component form so this fails if the route is dropped.
    expect(app).toContain('<Route path="/home"><Redirect to="/messages" /></Route>');
    expect(app).toContain('<Route path="/"><Redirect to="/messages" /></Route>');
    expect(messages).toContain("const desktopPreviewMessages: never[] = [];");
    expect(messages).toContain('const isPreviewConversation = Boolean(selectedConversationId && isPreviewConversationId(selectedConversationId));');
    expect(messages).toContain('chatPreviewMode === "detail" && previewConversations[0]');
    // The preview guard is now nested inside a string-id check rather than
    // being a bare DEV branch, so assert the pieces that must survive: the
    // guard itself, and the fallback a real visitor gets in production.
    expect(messages).toContain('if (isPreviewConversationId(conversation.id)) {');
    expect(messages).toContain('if (import.meta.env.DEV) {');
    expect(messages).toContain('return toast.info("Development preview chat - no real conversation opened");');
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
    expect(styles).toContain('.savanna-app .savanna-chat-glass-header');
    expect(styles).toContain('.dark .savanna-app .savanna-chat-glass-header');
    expect(animatedIcons).toContain('export function AnimatedSendIcon');
    expect(animatedIcons).toContain('className={cn("inline-flex items-center justify-center", className)}');
    // The send glyph must be rotated a quarter turn anticlockwise so the plane
    // points nose-up. That rotation is owned by a plain `.savanna-send-icon`
    // wrapper (source + stylesheet), NOT by the motion element's inline style:
    // framer-motion rewrites `transform` on elements it controls, so an inline
    // transform there survives SSR but can be clobbered on the client.
    expect(animatedIcons).toContain('<span className="savanna-send-icon">');
    expect(styles).toMatch(/\.savanna-app \.savanna-send-icon \{[^}]*transform:\s*rotate\(-90deg\)/);
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

  // Regression guard: the frontend ships to Firebase Hosting, which serves
  // static files only. A page that still calls tRPC gets the SPA fallback HTML
  // back and dies with `Unexpected token '<' ... is not valid JSON`, which is
  // exactly the failure that broke sign-in on the static deploy. Every route
  // reachable in the MVP must therefore read and write through Firestore.
  it("keeps every MVP-reachable route free of tRPC calls", async () => {
    const appSource = await readFile(resolve(projectRoot, "client/src/App.tsx"), "utf8");

    const routes = [...appSource.matchAll(/<Route\s+path="([^"]+)"(?:\s+component=\{(\w+)\})?/g)]
      .map(match => ({ path: match[1], component: match[2] }))
      .filter((route): route is { path: string; component: string } => Boolean(route.component));

    // Surfaces deliberately deferred past the MVP. Learn is hidden (its routes
    // redirect to /shops) and payments are not processing yet, so these may
    // still target the Express server. Everything else must not.
    const deferred = new Set([
      "CoursePage",
      "LearnPage",
      "CreatorStudioPage",
      "PaymentsPage",
      "PaymentDetailPage",
    ]);

    const live = routes.filter(route => !deferred.has(route.component));
    expect(live.length).toBeGreaterThan(5);

    for (const route of live) {
      const file = resolve(projectRoot, "client/src/pages", `${route.component}.tsx`);
      const source = await readFile(file, "utf8");
      expect(
        source.includes("trpc."),
        `${route.component} (${route.path}) is reachable on the static deploy and must not call tRPC`
      ).toBe(false);
    }
  });

  // The buyer records how they intend to pay, but must never be able to move
  // their own order forward or rewrite what they owe.
  it("lets the buyer write only the payment-preference fields on an order", async () => {
    const rules = await readFile(resolve(projectRoot, "firestore.rules"), "utf8");
    const ordersBlock = rules.slice(rules.indexOf("match /orders/{orderId}"));
    const updateRule = ordersBlock.slice(
      ordersBlock.indexOf("allow update:"),
      ordersBlock.indexOf("allow delete:")
    );

    expect(updateRule).toContain("resource.data.storefrontOwnerUserId == request.auth.uid");
    expect(updateRule).toContain("resource.data.buyerUserId == request.auth.uid");
    // Without the status check a buyer could confirm an already-paid order.
    expect(updateRule).toContain("resource.data.status == 'awaiting_payment'");
    // Without affectedKeys the buyer could set status to "paid" for free.
    expect(updateRule).toContain("affectedKeys()");
    expect(updateRule).toContain("hasOnly(['paymentCountryCode', 'paymentProviderCode', 'updatedAt'])");
    expect(ordersBlock.slice(ordersBlock.indexOf("allow delete:"))).toContain("allow delete: if false;");
  });

  // Regression guard: the composer field is a glass pill shared by web and
  // mobile in both themes. Opaque fills and per-breakpoint radius rules have
  // silently defeated this surface more than once, so assert the properties
  // that make it glass rather than just asserting the class is present.
  it("makes the message composer a glass pill with circular actions in both themes", async () => {
    const styles = await readFile(resolve(projectRoot, "client/src/index.css"), "utf8");
    const messages = await readFile(resolve(projectRoot, "client/src/pages/MessagesPage.tsx"), "utf8");

    // One shared class, so web and mobile cannot drift apart.
    expect(messages).toContain("savanna-composer-field");

    const ruleBody = (selector: string) => {
      const start = styles.indexOf(selector);
      expect(start, `missing rule: ${selector}`).toBeGreaterThan(-1);
      return styles.slice(start, styles.indexOf("}", start));
    };

    const base = ruleBody(".savanna-app .savanna-composer-field {");
    expect(base).toMatch(/border-radius:\s*9999px/);
    expect(base).toMatch(/backdrop-filter:[^;]*blur\(/);
    expect(base).toMatch(/box-shadow:\s*none/);

    // The dark theme must restate the surface, not just rely on the base rule.
    expect(ruleBody(".dark .savanna-app .savanna-composer-field {")).toMatch(/background:/);

    // Any opaque fill on the field itself defeats the blur. Strip comments
    // first: a selector match would otherwise swallow the comment block above
    // it, and those comments legitimately mention this class by name.
    const css = styles.replace(/\/\*[\s\S]*?\*\//g, "");
    const fieldRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(match => ({ selector: match[1].trim(), body: match[2] }))
      .filter(rule => /savanna-composer-field/.test(rule.selector));

    expect(fieldRules.length).toBeGreaterThan(0);
    for (const rule of fieldRules) {
      expect(
        /background(-color)?:\s*#[0-9A-Fa-f]{3,8}\s*!important/.test(rule.body),
        `opaque background defeats the composer glass: ${rule.selector}`
      ).toBe(false);
    }

    // Mic and send are circles so they nest flush in the pill.
    expect(messages).toContain("savanna-send-button savanna-composer-action savanna-brand-token shrink-0 rounded-full");
    expect(messages).toContain("savanna-composer-action savanna-brand-token shrink-0 rounded-full");
  });

  // Regression guard: two product-wide a11y rules paint a gold outline on
  // every focused control, and on a search pill or the composer that reads as
  // a stray gold halo. Both are switched off for those fields at both
  // breakpoints - the `!important` mobile rule included.
  it("keeps the gold focus halo off the search and message fields", async () => {
    const styles = await readFile(resolve(projectRoot, "client/src/index.css"), "utf8");
    const css = styles.replace(/\/\*[\s\S]*?\*\//g, "");

    // The two rules that paint the gold, so the guard fails loudly if either
    // is rewritten and the override below stops targeting the right thing.
    expect(css).toMatch(/:where\(a,\s*button,\s*input,\s*textarea,\s*select\):focus-visible\s*\{[^}]*outline:\s*3px solid[^;]*#F2C14E/);
    expect(css).toMatch(/\.savanna-app input:focus-visible[\s\S]{0,120}?outline:\s*3px solid #F2C14E !important/);

    const neutralised = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(match => ({ selector: match[1].trim(), body: match[2] }))
      .filter(rule => /:focus-visible$/.test(rule.selector.trim()))
      .filter(rule => /savanna-route-search|savanna-desktop-chat-search|savanna-mobile-chat-search|savanna-composer-field/.test(rule.selector));

    expect(neutralised.length).toBeGreaterThan(0);
    for (const rule of neutralised) {
      expect(rule.body).toMatch(/outline:\s*0\s*!important/);
      // shadcn's Input paints its focus via a ring box-shadow, not an outline.
      expect(rule.body).toMatch(/box-shadow:\s*none\s*!important/);
    }

    // Every search and message field is covered by name.
    for (const field of [
      ".savanna-route-search",
      ".savanna-desktop-chat-search",
      ".savanna-mobile-chat-search",
      ".savanna-composer-field",
    ]) {
      expect(
        neutralised.some(rule => rule.selector.includes(field)),
        `no neutralising rule covers ${field}`
      ).toBe(true);
    }
  });

  // Regression guard: tapping an avatar in the chat list or in a conversation
  // header opens the other person's /people/:userId profile. The whole thing
  // silently degrades to "nothing happens" if `memberIds` stops being read off
  // the Firestore document, which is invisible to a typecheck — the field is
  // optional at runtime and simply comes back undefined.
  it("links chat avatars through to the counterparty's public profile", async () => {
    const chat = await readFile(resolve(projectRoot, "client/src/lib/firebaseChat.ts"), "utf8");
    const messages = await readFile(resolve(projectRoot, "client/src/pages/MessagesPage.tsx"), "utf8");
    const header = await readFile(resolve(projectRoot, "client/src/components/ConversationHeader.tsx"), "utf8");

    // The list item must carry the participants, and the mapper must read them
    // off the document. Without this the peer can never be resolved.
    expect(chat).toMatch(/export type FirebaseConversationListItem = \{[\s\S]*?memberIds:\s*string\[\][\s\S]*?\}/);
    expect(chat).toMatch(/memberIds:\s*Array\.isArray\(data\.memberIds\)\s*\?\s*data\.memberIds\.map\(String\)\s*:\s*\[\]/);

    // Peer resolution returns null for groups and while signed out, so the
    // avatar never looks tappable when there is no single profile to open.
    expect(chat).toMatch(/export function getConversationPeerId\(/);
    expect(chat).toMatch(/if \(conversation\.kind === "group"\) return null;/);
    expect(chat).toMatch(/if \(!viewerId\) return null;/);

    // Both surfaces navigate to the public profile route.
    expect(messages).toContain("const [, navigate] = useLocation();");
    expect(messages).toMatch(/navigate\(`\/people\/\$\{peerId\}`\)/);
    expect(messages).toContain("onAvatarClick={peerProfileOpener(selected)}");
    // Header appears twice: the mobile detail view and the desktop panel.
    expect(messages.match(/onAvatarClick=\{peerProfileOpener\(selected\)\}/g)?.length).toBe(2);

    // The header only offers a button when it is given a handler; otherwise a
    // group avatar would advertise a tap that does nothing.
    expect(header).toMatch(/onAvatarClick\?:/);
    expect(header).toMatch(/onAvatarClick \? \([\s\S]*?<button[\s\S]*?onClick=\{onAvatarClick\}/);
    expect(header).toContain(`aria-label={\`Open \${title}'s profile\`}`);

    // A chat row contains its own nested avatar button, so the row itself must
    // not be a <button> — nesting interactive content is invalid HTML and the
    // avatar click would be swallowed. The nested handler stops propagation so
    // opening a profile does not also select the conversation.
    expect(messages).toMatch(/role="button"\s*\n\s*tabIndex=\{0\}/);
    expect(messages).toMatch(/onClick=\{event => \{\s*\n\s*event\.stopPropagation\(\);/);
    expect(messages).not.toMatch(/<button[\s\S]{0,400}savanna-chat-row/);
  });
});
