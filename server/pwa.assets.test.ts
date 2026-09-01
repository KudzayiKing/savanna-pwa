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
    expect(firebaseChat).toContain("conversationInvites");
    expect(firebaseChat).toContain("joinFirebaseConversationInvite");
    expect(firebaseChat).toContain("inviteCode");
    expect(firebaseChat).toContain("onSnapshot(");
    expect(firebaseChat).toContain("writeBatch(db)");
    expect(firebaseChat).toContain(".sort((left, right) => new Date(right.lastMessageAt ?? 0).getTime()");
    expect(messages).toContain("username-search");
    expect(messages).toContain("invitee-search");
    expect(messages).toContain("searchUserProfilesByUsername");
    expect(messages).toContain("startChatWithProfile");
    expect(messages).toContain("selectedInvitees");
    expect(messages).toContain("Search @username to add people");
    expect(messages).toContain("Share invite link");
    expect(messages).not.toContain("User IDs, comma-separated");
    expect(messages).not.toContain("Savanna user ID");
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
    expect(profile).toContain("useFirebaseMessageMemories(user)");
    expect(profile).toContain("useFirebaseMessageMemoryMutations(user)");
    expect(profile).toContain("Chat memories");
    expect(profile).toContain("Story performance");
    expect(profile).toContain("StoryPerformanceRow");
    expect(profile).toContain('memory.sourceType === "story"');
    expect(profile).toContain('sessionStorage.setItem("savanna-open-conversation", memory.conversationId)');
    expect(publicProfile).toContain("@{item.username}");
    expect(publicProfile).toContain("<SavannaShell hideMobileHeader hideDesktopHeader>");
    expect(publicProfile).toContain("savanna-public-profile-page");
    expect(publicProfile).toContain("savanna-public-profile-identity");
    expect(publicProfile).toContain("savanna-public-profile-tabs");
    expect(publicProfile).toContain("savanna-public-profile-grid");
    expect(publicProfile).toContain('type ProfileStoryTab = "stories" | "memories";');
    expect(publicProfile).toContain("activeStoryTab");
    expect(publicProfile).toContain("storyGridItems = profile.data.stories.filter(story => !story.storefrontId && !story.isMemory)");
    expect(publicProfile).toContain("memoryGridItems = profile.data.stories.filter(story => !story.storefrontId && story.isMemory)");
    expect(publicProfile).toContain("visibleStoryGridItems");
    expect(publicProfile).toContain("story.communityName");
    expect(publicProfile).toContain('href={`/stories?story=${story.id}`}');
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
    expect(firestoreRules).toContain("match /conversationInvites/{inviteCode}");
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

  it("provides a dedicated Recall screen for saved chat memories", async () => {
    const [app, profile, recall, messages] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/App.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/ProfilePage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/RecallPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/MessagesPage.tsx"), "utf8"),
    ]);

    expect(app).toContain('const RecallPage = lazy(() => import("./pages/RecallPage"))');
    expect(app).toContain('<Route path="/recall" component={RecallPage} />');
    expect(profile).toContain('href="/recall"');
    expect(profile).toContain("Open Recall");
    expect(profile).toContain('sessionStorage.setItem("savanna-open-message", memory.messageId)');
    expect(recall).toContain("Ask your Savanna memory.");
    expect(recall).toContain('memory.sourceType === "story"');
    expect(recall).toContain("Open story");
    expect(recall).toContain("quickPrompts");
    expect(recall).toContain("what do I need to follow up on?");
    expect(recall).toContain("Follow-ups");
    expect(recall).toContain("All memories");
    expect(recall).toContain("completeFollowUp");
    expect(recall).toContain("snoozeFollowUp");
    expect(recall).toContain("clearFollowUp");
    expect(recall).toContain("Done");
    expect(recall).toContain("Snooze");
    expect(recall).toContain("Clear");
    expect(recall).toContain("generateAnswer");
    expect(recall).toContain("answering");
    expect(messages).toContain("renderDueFollowUpsPrompt");
    expect(messages).toContain("isSavannaFollowUpDue");
    expect(messages).toContain('navigate("/recall")');
    expect(recall).toContain('sessionStorage.setItem("savanna-open-message", source.messageId)');
    expect(recall).toContain("prepareMemoryConversation");
    expect(messages).toContain('const pendingMessageId = sessionStorage.getItem("savanna-open-message")');
    expect(messages).toContain("pendingOpenMessageId.current = pendingMessageId");
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
    const [themeContext, html, styles] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/contexts/ThemeContext.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/index.html"), "utf8"),
      readFile(resolve(projectRoot, "client/src/index.css"), "utf8"),
    ]);

    expect(html).toContain('content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
    expect(html).toContain('content="rgba(255, 255, 255, 0.72)"');
    expect(html).toContain('dark ? "rgba(17, 27, 33, 0.72)" : "rgba(255, 255, 255, 0.72)"');
    expect(themeContext).toContain('const pageColor = theme === "dark" ? "#111B21" : "#FFFFFF";');
    expect(themeContext).toContain('const statusBarColor = theme === "dark" ? "rgba(17, 27, 33, 0.72)" : "rgba(255, 255, 255, 0.72)";');
    expect(themeContext).toContain('document.querySelector<HTMLMetaElement>(\'meta[name="theme-color"]\')');
    expect(themeContext).toContain("themeMeta.content = statusBarColor");
    expect(themeContext).toContain("document.body.style.backgroundColor = pageColor");
    expect(styles).toContain("body::before");
    expect(styles).toContain("height: env(safe-area-inset-top, 0px);");
    expect(styles).toContain("-webkit-backdrop-filter: saturate(180%) blur(22px);");
    expect(styles).toContain(".dark body::before");
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
    expect(merchantStudio).toContain("Product Memory performance");
    expect(merchantStudio).toContain("ProductMemoryPerformance");
    expect(merchantStudio).not.toContain("Ember");
  });

  it("provides a mobile Stories header and a familiar mobile chat-list hierarchy", async () => {
    const [
      shell,
      stories,
      messages,
      profile,
      wallpaperSection,
      wallpaperContext,
      styles,
      animatedIcons,
      shops,
      learn,
      orders,
      storiesPage,
      communitiesPage,
      communityDetailPage,
      storefrontPage,
      productDetailPage,
      app,
      firebaseStories,
      firebaseShops,
      firebaseChat,
      firebaseCommunities,
      firestoreRules,
      storageRules,
      firestoreIndexes,
      gemmaAi,
      aiRoutes,
      serverGemma,
      savannaOrchestrator,
      inferenceProvider,
      localGemmaProvider,
      cloudGemmaProvider,
      mockInferenceProvider,
      embeddingProvider,
      localEmbeddingGemmaProvider,
      translationProvider,
      localTranslateGemmaProvider,
      cloudTranslationProvider,
      savannaWorker,
      viteEnv,
      envExample,
      netlifyFunction,
    ] = await Promise.all([
      readFile(resolve(projectRoot, "client/src/components/SavannaShell.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/components/StoriesPanel.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/MessagesPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/ProfilePage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/components/WallpaperSection.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/contexts/WallpaperContext.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/index.css"), "utf8"),
      readFile(resolve(projectRoot, "client/src/components/AnimatedNavIcons.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/ShopsPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/LearnPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/OrdersPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/StoriesPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/CommunitiesPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/CommunityDetailPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/StorefrontPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/pages/ProductDetailPage.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/App.tsx"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/firebaseStories.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/firebaseShops.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/firebaseChat.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/firebaseCommunities.ts"), "utf8"),
      readFile(resolve(projectRoot, "firestore.rules"), "utf8"),
      readFile(resolve(projectRoot, "storage.rules"), "utf8"),
      readFile(resolve(projectRoot, "firestore.indexes.json"), "utf8"),
      readFile(resolve(projectRoot, "client/src/lib/gemmaAi.ts"), "utf8"),
      readFile(resolve(projectRoot, "server/_core/aiRoutes.ts"), "utf8"),
      readFile(resolve(projectRoot, "server/_core/gemma.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/orchestrator/SavannaOrchestrator.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/inference/InferenceProvider.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/inference/LocalGemmaProvider.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/inference/CloudGemmaProvider.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/inference/MockInferenceProvider.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/embedding/EmbeddingProvider.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/embedding/LocalEmbeddingGemmaProvider.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/translation/TranslationProvider.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/translation/LocalTranslateGemmaProvider.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/savanna/translation/CloudTranslationProvider.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/workers/savanna.worker.ts"), "utf8"),
      readFile(resolve(projectRoot, "client/src/vite-env.d.ts"), "utf8"),
      readFile(resolve(projectRoot, ".env.example"), "utf8"),
      readFile(resolve(projectRoot, "server/_core/netlify.ts"), "utf8"),
    ]);

    expect(shell).toContain("<MobileStoriesHeader />");
    expect(shell).toContain("const mobileNavigation = navigation;");
    expect(shell).toContain("navigation.map((item) =>");
    expect(shell).toContain("mobileNavigation.map((item) =>");
    expect(shell).toContain('{ href: "/stories", label: "Stories" }');
    expect(shell).toContain('{ href: "/communities", label: "Communities" }');
    expect(shell).toContain('isMessagesWorkspace ? "lg:h-screen lg:min-h-0 lg:max-h-screen lg:overflow-hidden"');
    expect(shell).toContain('isMessagesWorkspace ? "min-h-screen p-0 lg:h-screen lg:min-h-0 lg:overflow-hidden"');
    expect(shell).toContain('isMessagesWorkspace ? "w-full lg:h-full lg:min-h-0 lg:overflow-hidden"');
    expect(shell).not.toContain('{ href: "/profile", label: "Profile" }');
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
    expect(stories).toContain("type StoryTarget");
    expect(stories).toContain('useState<StoryTarget>(hasBusinessContext ? "shop" : hasCommunityContext ? "community" : "story")');
    expect(stories).toContain("useMyFirebaseStorefront");
    expect(stories).toContain("useFirebaseCommunities");
    expect(stories).toContain("Choose a community");
    expect(stories).toContain("Product name");
    expect(stories).toContain("communityId: isCommunityStory ? selectedCommunity?.id : undefined");
    expect(stories).toContain("storefrontId: isShopStory ? targetStorefrontId : undefined");
    expect(stories).toContain("This will stay in Memories");
    expect(stories).toContain("story.communityId");
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
    expect(stories).toContain('href={isAuthenticated ? "/profile" : "/login"}');
    expect(stories).toContain('aria-label="Open profile"');
    expect(stories).toContain("{ownStoryAvatarUrl ? <img src={ownStoryAvatarUrl}");
    expect(stories).not.toContain("<UserIcon size={21} />");
    expect(stories).not.toContain('const [menuPulse, setMenuPulse] = useState(0);');
    expect(stories).not.toContain('const [searchPulse, setSearchPulse] = useState(0);');
    expect(stories).not.toContain('onPointerDown={() => setMenuPulse(current => current + 1)}');
    expect(stories).not.toContain('AnimatedMenuIcon className="size-5" size={20} pulse={menuPulse}');
    expect(stories).not.toContain('AnimatedSearchIcon className="size-5" size={20} pulse={searchPulse}');
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
    expect(animatedIcons).toContain('MobileNavIconName = "Home" | "Messages" | "Shops" | "Learn" | "Stories" | "Communities" | "Orders" | "Profile"');
    expect(animatedIcons).toContain('if (name === "Stories")');
    expect(animatedIcons).toContain('if (name === "Communities")');
    // The Communities glyph is lucide's `users`, the same set as every other
    // icon in this nav. Its right-hand partial silhouette is mirrored onto the
    // left to give three figures, and the two side ones slide in. Assert the
    // split, since collapsing it back into one path would silently kill the
    // animation.
    //
    // We also pin the glyph as stroke-based (`fill="none" stroke=...`), which
    // is what makes it match the sibling icons. The earlier Material
    // MdOutlineGroups version was fill-based and rendered visibly shorter than
    // its neighbours, because that glyph is only 12 user-units tall inside a
    // 24-unit square viewBox where the others span 18.
    expect(animatedIcons).toContain("leftSideVariants");
    expect(animatedIcons).toContain("rightSideVariants");
    expect(animatedIcons).toContain("bodyArcVariants");
    expect(animatedIcons).toContain('x: [-3, 0]');
    expect(animatedIcons).toContain('x: [3, 0]');
    expect(animatedIcons).toContain('fill="none" stroke="currentColor"');
    expect(animatedIcons).toContain("const movingLineVariants: Variants");
    expect(animatedIcons).toContain('y: [0, -4.5, 0, -4.5, 0]');
    expect(animatedIcons).toContain("variants={movingLineVariants}");
    expect(app).toContain('const StoriesPage = lazy(() => import("./pages/StoriesPage"));');
    expect(app).toContain('const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage"));');
    expect(app).toContain('const CommunityDetailPage = lazy(() => import("./pages/CommunityDetailPage"));');
    expect(app).toContain('<Route path="/stories" component={StoriesPage} />');
    expect(app).toContain('<Route path="/communities/:communityId" component={CommunityDetailPage} />');
    expect(app).toContain('<Route path="/communities" component={CommunitiesPage} />');
    expect(communitiesPage).toContain("savanna-route-communities");
    expect(communitiesPage).toContain('MobileNavIcon name="Communities" active size={16}');
    expect(communitiesPage).toContain("useFirebaseCommunities");
    expect(communitiesPage).toContain("useFirebaseCommunityMutations");
    expect(communitiesPage).toContain("Create community");
    expect(communitiesPage).toContain("Joined community");
    expect(communitiesPage).toContain("Groups");
    expect(communitiesPage).toContain("Channels");
    expect(communitiesPage).toContain("Shops");
    expect(communitiesPage).toContain("Automation");
    expect(storiesPage).toContain('type StoryDiscoveryTab = "for_you" | "near_you" | "following" | "shops" | "community";');
    expect(storiesPage).toContain('if (tab === "community") return Boolean(story.communityId);');
    expect(storiesPage).toContain("CommunityOverlay");
    expect(storiesPage).toContain('Link href={`/communities/${story.communityId}`}');
    expect(storiesPage).toContain("buildStoriesFeedItems");
    expect(storiesPage).toContain("StoryAdContext");
    expect(storiesPage).toContain("useFirebaseCommunityDiscoveryPosts");
    expect(storiesPage).toContain("useFirebaseStory");
    expect(storiesPage).toContain("requestedStoryId");
    expect(storiesPage).toContain("requestedStory.data");
    expect(storiesPage).toContain("contentItemId(item) === requestedStoryId");
    expect(storiesPage).toContain('kind: "community-post"');
    expect(storiesPage).toContain("CommunityPostReel");
    expect(storiesPage).toContain("contentMatchesTab");
    expect(storiesPage).toContain("communityPostIsNearViewer");
    expect(storiesPage).toContain("communityPostCount");
    expect(storiesPage).toContain('Link href={`/communities/${post.communityId}`}');
    expect(storiesPage).toContain("post.productId");
    expect(storiesPage).toContain("post.productPrimaryImageUrl");
    expect(storiesPage).toContain('`/shops/${post.storefrontSlug}/products/${post.productId}`');
    expect(storiesPage).toContain('if (tab === "shops") return Boolean(item.post.productId || item.post.storefrontId);');
    expect(storiesPage).toContain('if (tab === "community") return true;');
    expect(storiesPage).toContain("return false;");
    expect(storiesPage).not.toContain('return !story.storefrontId && (story.discovery.slot === "around_you" || story.audience === "public");');
    expect(storiesPage).toContain("adsEnabled = false");
    expect(storiesPage).toContain("savanna-story-filter-pill");
    expect(storiesPage).toContain('activeTab === tab.value ? "border-[#D9A441]/30 bg-[#D9A441]/20 text-[#D9A441]"');
    expect(storiesPage).toContain("For You");
    expect(storiesPage).toContain("Near You");
    expect(storiesPage).toContain("Following");
    expect(storiesPage).toContain("Shops");
    expect(storiesPage).toContain("Community");
    expect(storiesPage).toContain("useCommentFirebaseStory");
    expect(storiesPage).toContain("useDeleteFirebaseStoryComment");
    expect(storiesPage).toContain("useFirebaseStoryAnalytics");
    expect(storiesPage).toContain("useFirebaseStoryComments");
    expect(storiesPage).toContain("useReplyToFirebaseStory");
    expect(storiesPage).toContain("useSaveFirebaseStoryMemory");
    expect(storiesPage).toContain("useFirebaseMessageMemories");
    expect(storiesPage).toContain("savedStoryIds");
    expect(storiesPage).toContain("BookmarkCheck");
    expect(storiesPage).toContain("Already saved to Memory");
    expect(storiesPage).toContain("StoryProgressBars");
    expect(storiesPage).toContain("Pause story");
    expect(storiesPage).toContain("Mute story");
    expect(storiesPage).toContain("Previous story");
    expect(storiesPage).toContain("Next story");
    expect(storiesPage).toContain("recordPlacement");
    expect(storiesPage).toContain("useLogFirebaseStoryPlacementEvent");
    expect(storiesPage).toContain("Saved to Memory");
    expect(storiesPage).toContain("StoryAnalyticsPill");
    expect(storiesPage).toContain("Creator stats");
    expect(storiesPage).toContain('targetDomain="story_comment"');
    expect(storiesPage).toContain('targetDomain="community_post"');
    expect(storiesPage).toContain("Community post saved");
    expect(storiesPage).toContain("navigator.share");
    expect(storiesPage).toContain("Visit shop");
    expect(storiesPage).toContain("Contextual placement ready.");
    expect(storiesPage).toContain('const shouldOpenComposer = storyParams.get("compose") === "1";');
    expect(storiesPage).toContain("composerCommunityId");
    expect(storiesPage).toContain("composerStorefrontId");
    expect(storiesPage).toContain("composerProductId");
    expect(storiesPage).toContain("initialProductPriceMinor");
    expect(messages).toContain("Search chats or people");
    expect(shops).toContain("useFirebaseCommunityDiscoveryPosts");
    expect(shops).toContain("communityProductPosts");
    expect(shops).toContain("From communities");
    expect(shops).toContain("Products people are talking about");
    expect(messages).toContain("Create a chat tab");
    expect(messages).toContain('const filterTabs = ([["all", "All"], ["unread", "Unread"], ["direct", "Chats"], ["group", "Groups"], ["merchant_support", "Support"]] as const);');
    expect(messages).toContain("savanna-message-tab-membership");
    expect(messages).toContain("setMobileDetail(true)");
    expect(messages).toContain("DrawerContent");
    expect(messages).toContain('type CreationMode = FirebaseConversationKind | "community";');
    expect(messages).toContain('useFirebaseCommunityMutations(user)');
    expect(messages).toContain('data-active={creationMode === "community"}');
    expect(messages).toContain('"Create community"');
    expect(firebaseCommunities).toContain('collection(db, "communities")');
    expect(firebaseCommunities).toContain("createFirebaseCommunity");
    expect(firebaseCommunities).toContain("joinFirebaseCommunity");
    expect(firebaseCommunities).toContain("getFirebaseCommunityDetail");
    expect(firebaseCommunities).toContain("listFirebaseCommunityMessages");
    expect(firebaseCommunities).toContain("listFirebaseCommunityPosts");
    expect(firebaseCommunities).toContain("listFirebaseCommunityDiscoveryPosts");
    expect(firebaseCommunities).toContain("listFirebaseBlockedUserIds");
    expect(firebaseCommunities).toContain("useFirebaseCommunityDiscoveryPosts");
    expect(firebaseCommunities).toContain("FirebaseCommunityDiscoveryPost");
    expect(firebaseCommunities).toContain('surface: "stories"');
    expect(firebaseCommunities).toContain("type FirebaseProduct");
    expect(firebaseCommunities).toContain("product?: FirebaseProduct | null");
    expect(firebaseCommunities).toContain("productPrimaryImageUrl");
    expect(firebaseCommunities).toContain("isProductMemory: Boolean(post.productId)");
    expect(firebaseCommunities).toContain("sendFirebaseCommunityMessage");
    expect(firebaseCommunities).toContain("createFirebaseCommunityPost");
    expect(firebaseCommunities).toContain("reactToFirebaseCommunityPost");
    expect(firebaseCommunities).toContain("reactToPost");
    expect(firebaseCommunities).toContain("linkFirebaseStorefrontToCommunity");
    expect(firebaseCommunities).toContain("communityInvites");
    expect(firebaseCommunities).toContain("joinFirebaseCommunityInvite");
    expect(firebaseCommunities).toContain("inviteCode");
    expect(firebaseStories).toContain("communityId: string | null;");
    expect(firebaseStories).toContain("communityName: string | null;");
    expect(firebaseStories).toContain("communityId?: string;");
    expect(firebaseStories).toContain("communityName?: string | null;");
    expect(firebaseStories).toContain("communityId: input.communityId ?? null");
    expect(firebaseStories).toContain("getFirebaseStory");
    expect(firebaseStories).toContain("useFirebaseStory");
    expect(firebaseStories).toContain("FirebaseStoryAnalytics");
    expect(firebaseStories).toContain("getFirebaseStoryAnalytics");
    expect(firebaseStories).toContain("deleteFirebaseStoryComment");
    expect(firebaseStories).toContain("saveFirebaseStoryMemory");
    expect(firebaseStories).toContain("FirebaseStoryPlacementAction");
    expect(firebaseStories).toContain("logFirebaseStoryPlacementEvent");
    expect(firebaseStories).toContain('collection(getFirestoreDb(), "storyPlacementEvents")');
    expect(firebaseStories).toContain("useLogFirebaseStoryPlacementEvent");
    expect(firebaseStories).toContain('sourceType: "story"');
    expect(firebaseStories).toContain("listFirebaseBlockedUserIds");
    expect(firebaseStories).toContain('doc(getFirestoreDb(), "stories", story.id, "replies", user.id)');
    expect(firebaseStories).toContain('doc(getFirestoreDb(), "stories", storyId)');
    expect(communitiesPage).toContain("shareCommunityInvite");
    expect(communitiesPage).toContain('params.get("invite")');
    expect(communitiesPage).toContain("Share2");
    expect(communitiesPage).toContain('href={`/communities/${community.id}`}');
    expect(communityDetailPage).toContain('useRoute("/communities/:communityId")');
    expect(communityDetailPage).toContain('type CommunityTab = "chat" | "posts" | "shops";');
    expect(communityDetailPage).toContain("useFirebaseCommunityDetail");
    expect(communityDetailPage).toContain("useFirebaseCommunityMessages");
    expect(communityDetailPage).toContain("useFirebaseCommunityPosts");
    expect(communityDetailPage).toContain("useMyFirebaseStorefront");
    expect(communityDetailPage).toContain("selectedProductId");
    expect(communityDetailPage).toContain("Attach a product");
    expect(communityDetailPage).toContain('setPostKind("listing")');
    expect(communityDetailPage).toContain("product: selectedProduct");
    expect(communityDetailPage).toContain("post.productId");
    expect(communityDetailPage).toContain("ShoppingBag");
    expect(communityDetailPage).toContain("Message this community");
    expect(communityDetailPage).toContain("Publish");
    expect(communityDetailPage).toContain("Link");
    expect(communityDetailPage).toContain("Join to chat.");
    expect(communityDetailPage).toContain("shareInvite");
    expect(communityDetailPage).toContain("Share a community Story");
    expect(communityDetailPage).toContain("<StoryComposer compact communityMode communityId={community.id} communityName={community.name}");
    expect(communityDetailPage).toContain("WallpaperSection");
    expect(communityDetailPage).toContain("Community wallpaper");
    expect(communityDetailPage).toContain("savanna-community-chat-room");
    expect(communityDetailPage).toContain("savanna-community-composer");
    expect(storefrontPage).toContain("storyComposerHref");
    expect(storefrontPage).toContain("Share story");
    expect(storefrontPage).toContain('href={storyComposerHref}');
    expect(productDetailPage).toContain("productStoryHref");
    expect(productDetailPage).toContain("Share product Story");
    expect(productDetailPage).toContain("productPriceMinor");
    expect(firestoreRules).toContain("match /communities/{communityId}");
    expect(firestoreRules).toContain("match /members/{uid}");
    expect(firestoreRules).toContain("match /chatMessages/{messageId}");
    expect(firestoreRules).toContain("match /posts/{postId}");
    expect(firestoreRules).toContain("function productPath(productId)");
    expect(firestoreRules).toContain("function validCommunityPostCommerce()");
    expect(firestoreRules).toContain("function validStoryStorefrontTarget()");
    expect(firestoreRules).toContain("function validStoryCommunityTarget()");
    expect(firestoreRules).toContain("'communityId', 'communityName'");
    expect(firestoreRules).toContain("match /storyPlacementEvents/{eventId}");
    expect(firestoreRules).toContain("request.resource.data.viewerUserId == request.auth.uid");
    expect(firestoreRules).toContain("'ad_impression', 'ad_click'");
    expect(firestoreRules).toContain("'sourceKind', 'storyId', 'communityId', 'storefrontId', 'productId'");
    expect(firestoreRules).toContain("'productPrimaryImageUrl'");
    expect(firestoreRules).toContain("get(productPath(request.resource.data.productId)).data.storefrontOwnerUserId == request.auth.uid");
    expect(firestoreRules).toContain("match /communityInvites/{inviteCode}");
    expect(firestoreRules).toContain("joinedByInviteCode");
    expect(firestoreIndexes).toContain('"collectionGroup": "communities"');
    expect(messages).not.toContain('id="savanna-new-chat"');
    expect(messages).toContain("bottom-[calc(5.5rem+env(safe-area-inset-bottom))]");
    expect(messages).toContain('mx-2 mt-2 flex h-11 items-center gap-2 rounded-2xl');
    expect(messages).toContain('overflow-x-auto px-3 pb-1');
    expect(messages).toContain("savanna-mobile-chat-rows mt-3 divide-y-0 px-2");
    expect(messages).toContain("savanna-desktop-messages grid h-screen max-h-screen overflow-hidden");
    expect(messages).toContain("savanna-desktop-chat-list flex h-screen min-h-0 flex-col overflow-hidden");
    expect(messages).toContain("savanna-desktop-conversation-panel flex h-screen min-h-0 flex-col overflow-hidden");
    expect(messages).toContain("savanna-desktop-message-thread min-h-0 flex-1 space-y-3 overflow-y-auto");
    expect(messages).toContain('dark:bg-[#23282C] dark:text-[#D9A441]');
    expect(messages).toContain('savanna-mobile-messages-canvas -mx-4');
    expect(messages).not.toContain(">Chats</h1>");
    expect(messages).toContain("const previewConversations: ConversationListItem[] = [];");
    expect(messages).toContain("const desktopPreviewMessages: never[] = [];");
    expect(messages).toContain('const chatPreviewMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("chatPreview") : null;');
    expect(messages).toContain('useState(chatPreviewMode === "drawer")');
    expect(messages).toContain("useFirebaseConversations(user)");
    expect(messages).toContain("const messageQuery = useFirebaseMessages(");
    expect(messages).toContain("useFirebaseChatMutations(user)");
    expect(messages).toContain('id.startsWith("preview-")');
    expect(messages).toContain("if (isPreviewConversationId(conversation.id))");
    expect(styles).toContain(".savanna-app main [class*=\"rounded-[28px]\"][class*=\"border\"]");
    expect(styles).toContain("border: 0 !important;");
    expect(messages).toContain("Development preview chat - no real conversation opened");
    expect(messages).toContain('if (status === "read") return <AnimatedCheckCheckIcon className="text-[#22C55E]" size={13} aria-label="Read" />;');
    expect(messages).toContain('if (status === "delivered") return <AnimatedCheckCheckIcon className={className ?? "text-current"} size={13} aria-label="Delivered" />;');
    expect(messages).toContain('<AnimatedCheckIcon className={className ?? "text-current"} size={13} aria-label="Sent" />');
    expect(messages).toContain("function ChatListDeliveryIcon");
    expect(messages).toContain('const grey = "text-[#5f6861] dark:text-[#9AA1A6]"');
    expect(messages).toContain('<ChatListDeliveryIcon status={previewStatus ?? "sent"} />');
    expect(messages).toContain("!isMobile || mobileDetail");
    expect(messages).toContain('<DeliveryIcon status={message.status} className="text-white/90" />');
    expect(messages).toContain("const showPreviewDelivery = Boolean(");
    expect(messages).toContain("conversation.lastMessageSenderId === user.id");
    expect(messages).toContain("savanna-outgoing-message");
    expect(messages).toContain("setWallpaperDrawerOpen(true)");
    expect(messages).toContain("Group wallpaper");
    expect(profile).toContain("<WallpaperSection />");
    expect(wallpaperSection).toContain("MAX_CUSTOM_WALLPAPER_BYTES");
    expect(wallpaperSection).toContain("SAVANNA_WALLPAPERS");
    expect(wallpaperSection).toContain("WALLPAPER_COLOR_SWATCHES");
    expect(wallpaperSection).toContain("setCustomImage(reader.result)");
    expect(wallpaperContext).toContain('window.matchMedia("(min-width: 768px), (orientation: landscape)")');
    expect(wallpaperContext).toContain("prefersLandscapeWallpaper ? landscapeImage : portraitImage");
    expect(wallpaperContext).toContain("setting.kind === \"savanna-mobile\" || setting.kind === \"savanna-web\"");
    expect(styles).toContain("@media (min-width: 768px), (orientation: landscape)");
    expect(styles).toContain(":root:has(body .savanna-app .savanna-desktop-messages)");
    expect(styles).toContain("body:has(.savanna-desktop-messages)");
    expect(styles).toContain("height: 100dvh;");
    expect(styles).toContain("background-size: contain !important;");
    expect(styles).toContain("background-repeat: repeat !important;");
    expect(messages).toContain("const lastAutoScrolledMessageId = useRef<string | null>(null);");
    expect(messages).toContain("const autoScrollRetryTimer = useRef<number | null>(null);");
    expect(messages).toContain("const latestUnreadIncomingMessageId = useMemo(() => {");
    expect(messages).toContain("message.senderUserId !== user.id && !message.readBy.includes(user.id)");
    expect(messages).toContain("const targetAutoScrollMessageId = latestUnreadIncomingMessageId || latestMessageId;");
    expect(messages).toContain('message.closest(".savanna-mobile-message-thread, .savanna-desktop-message-thread")');
    expect(messages).toContain("thread.scrollTo({ top: Math.max(0, centeredTop), behavior });");
    expect(messages).toContain("const autoScrollToCurrentTarget = useCallback");
    expect(messages).toContain("const registerMessageElement = useCallback");
    expect(messages).toContain('autoScrollToCurrentTarget("auto");');
    expect(messages).toContain("autoScrollRetryTimer.current = window.setTimeout(scrollToThreadEntry, 80);");
    expect(messages).toContain("if (lastAutoScrolledMessageId.current === scrollKey) return true;");
    expect(messages).toContain("const mobileThreadRef = useRef<HTMLDivElement | null>(null);");
    expect(messages).toContain("const mobileComposerRef = useRef<HTMLFormElement | null>(null);");
    expect(messages).toContain('root.style.setProperty("--savanna-visual-viewport-height"');
    expect(messages).toContain('root.style.setProperty("--savanna-mobile-composer-height"');
    expect(messages).toContain('scrollMobileThreadToBottom("smooth")');
    expect(messages).toContain("parseSavannaInvocation");
    expect(messages).toContain("generateAnswer");
    expect(messages).toContain("openRecallSource");
    expect(messages).toContain("answer.sources.length");
    expect(messages).toContain("source.label");
    expect(messages).toContain("useFirebaseMessageMemories(user)");
    expect(messages).toContain("memories: messageMemories.data ?? []");
    expect(messages).toContain("Message or @Savanna");
    expect(messages).toContain("View ${source.label}");
    expect(messages).toContain("threadSearchOpen");
    expect(messages).toContain("threadSearchMatches");
    expect(messages).toContain("Search in chat");
    expect(messages).toContain('aria-label="Search this chat"');
    expect(messages).toContain("renderThreadSearchBar");
    expect(messages).toContain("renderPinnedMessages");
    expect(messages).toContain("toggleMessagePin");
    expect(messages).toContain("openPinnedMessage");
    expect(messages).toContain("pinnedMessages");
    expect(messages).toContain("Voice note sent");
    expect(messages).toContain("MediaRecorder");
    expect(messages).toContain('mimeType.startsWith("image/")');
    expect(messages).toContain('mimeType.startsWith("video/")');
    expect(messages).toContain('mimeType.startsWith("audio/")');
    expect(messages).toContain("setReplyTo(message)");
    expect(messages).toContain("Cancel reply");
    expect(messages).toContain("renderReplyContext(message)");
    expect(messages).toContain("renderReactionSummary(message)");
    expect(messages).toContain("activeMessageActions === message.id");
    expect(messages).toContain("longPressTimer.current = window.setTimeout");
    expect(messages).toContain("revealMessageActions(messageId, true)");
    expect(messages).toContain("scheduleMessageActionsHide");
    expect(messages).toContain("savanna-message-actions");
    expect(messages).toContain("savanna-desktop-message-bubble max-w-[58%] cursor-pointer rounded-2xl px-3 py-2");
    expect(messages).not.toContain('targetLabel="this message" blockUserId={message.senderUserId}');
    expect(messages).toContain("saveMessageMemory(message)");
    expect(messages).toContain("translateWithTranslateGemma");
    expect(messages).toContain("messageTranslations");
    expect(messages).toContain('<Languages className="size-3" />');
    expect(messages).toContain("Already saved to memory");
    expect(gemmaAi).toContain("LocalEmbeddingGemmaProvider");
    expect(gemmaAi).toContain("LocalTranslateGemmaProvider");
    expect(gemmaAi).toContain("CloudTranslationProvider");
    expect(gemmaAi).toContain('"/api/ai/memory-enrichment"');
    expect(gemmaAi).toContain('"/api/ai/recall-answer"');
    expect(gemmaAi).not.toContain('postJson<GemmaTranslationResponse>("/api/ai/translate"');
    expect(aiRoutes).toContain('app.post("/api/ai/recall-answer"');
    expect(aiRoutes).toContain('app.post("/api/ai/memory-enrichment"');
    expect(aiRoutes).toContain('app.post("/api/ai/translate"');
    expect(netlifyFunction).not.toContain("assertRuntimeConfig()");
    expect(serverGemma).toContain("google/gemma-4-E2B-it-qat-mobile-transformers");
    expect(serverGemma).toContain("google/embeddinggemma-300m");
    expect(serverGemma).toContain("google/translategemma-4b-it");
    expect(serverGemma).toContain("Optional CloudGemma/Savanna fallback URLs only");
    expect(savannaOrchestrator).toContain("export async function generateAnswer");
    expect(savannaOrchestrator).toContain("retrieveMemories");
    expect(savannaOrchestrator).toContain("retrieveSemanticMemorySources");
    expect(savannaOrchestrator).toContain("LocalEmbeddingGemmaProvider");
    expect(savannaOrchestrator).toContain("selectProvider");
    expect(savannaOrchestrator).toContain("answerConversationRecall");
    expect(savannaOrchestrator).toContain("savannaMemorySource");
    expect(inferenceProvider).toContain('export type SavannaInferenceProviderId = "local-gemma" | "cloud-gemma" | "mock"');
    expect(inferenceProvider).toContain('SAVANNA_LOCAL_GEMMA_CHECKPOINT_ID = "google/gemma-4-E2B-it-qat-mobile-transformers"');
    expect(inferenceProvider).toContain("SAVANNA_LOCAL_GEMMA_WEB_MODEL_URL");
    expect(inferenceProvider).toContain("gemma-4-E2B-it-web.litertlm");
    expect(inferenceProvider).toContain("SAVANNA_EMBEDDING_GEMMA_WEB_MODEL_ID");
    expect(inferenceProvider).toContain("SAVANNA_TRANSLATE_GEMMA_WEB_MODEL_URL");
    expect(inferenceProvider).toContain("translategemma-4b-it-int8-web.task");
    expect(localGemmaProvider).toContain("detectSavannaCapabilities");
    expect(localGemmaProvider).toContain("new Worker");
    expect(localGemmaProvider).toContain("navigator.gpu");
    expect(localGemmaProvider).toContain("navigator.storage");
    expect(localGemmaProvider).toContain("buildGroundedPrompt");
    expect(localGemmaProvider).toContain('request("generate"');
    expect(cloudGemmaProvider).toContain("requestGemmaRecallAnswer");
    expect(mockInferenceProvider).toContain("MockInferenceProvider");
    expect(embeddingProvider).toContain('export type EmbeddingProviderId = "local-embedding-gemma" | "local-hash"');
    expect(localEmbeddingGemmaProvider).toContain('@huggingface/transformers');
    expect(localEmbeddingGemmaProvider).toContain('pipeline("feature-extraction"');
    expect(localEmbeddingGemmaProvider).toContain("SAVANNA_EMBEDDING_GEMMA_WEB_MODEL_ID");
    expect(localEmbeddingGemmaProvider).toContain("localHashEmbedding");
    expect(translationProvider).toContain('export type TranslationProviderId = "local-translate-gemma" | "cloud-translation" | "passthrough"');
    expect(localTranslateGemmaProvider).toContain("SAVANNA_TRANSLATE_GEMMA_MODEL_ID");
    expect(localTranslateGemmaProvider).toContain("SAVANNA_TRANSLATE_GEMMA_WEB_MODEL_URL");
    expect(localTranslateGemmaProvider).toContain("SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL");
    expect(localTranslateGemmaProvider).toContain("FilesetResolver.forGenAiTasks");
    expect(localTranslateGemmaProvider).toContain("LlmInference.createFromOptions");
    expect(localTranslateGemmaProvider).toContain('caches.open("savanna-translategemma-models-v1")');
    expect(cloudTranslationProvider).toContain('"/api/ai/translate"');
    expect(savannaWorker).toContain("Engine.create");
    expect(savannaWorker).toContain("SAVANNA_LOCAL_GEMMA_WEB_MODEL_URL");
    expect(savannaWorker).toContain('caches.open("savanna-litertlm-models-v1")');
    expect(savannaWorker).toContain("@vite-ignore");
    expect(savannaWorker).toContain("sendMessage");
    expect(viteEnv).toContain("VITE_SAVANNA_INFERENCE");
    expect(viteEnv).toContain("VITE_SAVANNA_LOCAL_GEMMA_MODEL_URL");
    expect(viteEnv).toContain("VITE_SAVANNA_LITERT_LM_RUNTIME_URL");
    expect(viteEnv).toContain("VITE_SAVANNA_EMBEDDING_GEMMA_MODEL_ID");
    expect(viteEnv).toContain("VITE_SAVANNA_TRANSLATE_GEMMA_MODEL_ID");
    expect(viteEnv).toContain("VITE_SAVANNA_TRANSLATE_GEMMA_MODEL_URL");
    expect(viteEnv).toContain("VITE_SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL");
    expect(viteEnv).toContain("VITE_SAVANNA_MEDIAPIPE_GENAI_WASM_URL");
    expect(envExample).toContain("VITE_SAVANNA_INFERENCE=auto");
    expect(envExample).toContain("VITE_SAVANNA_LOCAL_GEMMA_MODEL_URL=https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm");
    expect(envExample).toContain("VITE_SAVANNA_LITERT_LM_RUNTIME_URL=https://cdn.jsdelivr.net/npm/@litert-lm/core/+esm");
    expect(envExample).toContain("VITE_SAVANNA_EMBEDDING_GEMMA_MODEL_ID=onnx-community/embeddinggemma-300m-ONNX");
    expect(envExample).toContain("VITE_SAVANNA_TRANSLATE_GEMMA_MODEL_ID=google/translategemma-4b-it");
    expect(envExample).toContain("VITE_SAVANNA_TRANSLATE_GEMMA_MODEL_URL=https://huggingface.co/litert-community/TranslateGemma-4B-IT/resolve/main/translategemma-4b-it-int8-web.task");
    expect(envExample).toContain("VITE_SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/+esm");
    expect(envExample).toContain("VITE_SAVANNA_MEDIAPIPE_GENAI_WASM_URL=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm");
    expect(envExample).toContain("The PWA never needs GEMMA_API_KEY or GEMMA_*_ENDPOINT for local inference.");
    expect(envExample).toContain("GEMMA_CHAT_MODEL=google/gemma-4-E2B-it-qat-mobile-transformers");
    expect(envExample).toContain("GEMMA_EMBEDDING_MODEL=google/embeddinggemma-300m");
    expect(envExample).toContain("GEMMA_TRANSLATE_MODEL=google/translategemma-4b-it");
    expect(firebaseChat).toContain("export type FirebaseMessageReactionKey");
    expect(firebaseChat).toContain("FIREBASE_MESSAGE_REACTIONS");
    expect(firebaseChat).toContain("toggleFirebaseMessageReaction");
    expect(firebaseChat).toContain("toggleFirebaseMessagePin");
    expect(firebaseChat).toContain("pinnedBy: []");
    expect(firebaseChat).toContain("saveFirebaseMessageMemory");
    expect(firebaseChat).toContain("listFirebaseMessageMemories");
    expect(firebaseChat).toContain("listFirebaseBlockedUserIds");
    expect(firebaseChat).toContain("blockedUserIdsRef");
    expect(firebaseChat).toContain("deleteFirebaseMessageMemory");
    expect(firebaseChat).toContain('collection(getFirestoreDb(), "users", uid, "memories")');
    expect(firebaseChat).toContain("inferSavannaMemoryTags(snippet)");
    expect(firebaseChat).toContain("inferSavannaFollowUp(snippet");
    expect(firebaseChat).toContain("followUpAt: followUp.dueAt");
    expect(firebaseChat).toContain("followUpLabel: followUp.label");
    expect(firebaseChat).toContain("followUpAction: followUp.action");
    expect(firebaseChat).toContain("followUpCompletedAt: null");
    expect(firebaseChat).toContain("enrichMemoryWithEmbeddingGemma");
    expect(firebaseChat).toContain("embeddingProvider: ai.embeddingProvider");
    expect(firebaseChat).toContain("semanticSummary: ai.semanticSummary");
    expect(firebaseStories).toContain("enrichMemoryWithEmbeddingGemma");
    expect(firebaseStories).toContain("embeddingProvider: ai.embeddingProvider");
    expect(firebaseStories).toContain("semanticSummary: ai.semanticSummary");
    expect(firebaseChat).toContain("completeFirebaseMessageFollowUp");
    expect(firebaseChat).toContain("snoozeFirebaseMessageFollowUp");
    expect(firebaseChat).toContain("clearFirebaseMessageFollowUp");
    expect(firebaseChat).toContain("tags,");
    expect(firebaseChat).toContain("replyToMessageId: input.replyTo?.messageId ?? null");
    expect(firebaseChat).toContain('doc(db, "users", input.user.id, "memories"');
    expect(firebaseChat).toContain("sourceType: \"message\"");
    expect(firebaseChat).toContain('sourceType: "message" | "story";');
    expect(firebaseChat).toContain('doc(db, "stories", input.memory.storyId, "reactions", `${input.user.id}_save`)');
    expect(firebaseChat).toContain("deliveredTo: [input.senderId]");
    expect(firebaseChat).toContain("readBy: [input.senderId]");
    expect(firebaseChat).toContain("lastMessageId: messageRef.id");
    expect(firebaseChat).toContain("lastMessageSenderId: input.senderId");
    expect(firebaseChat).toContain("unreadCount: memberId === input.senderId ? 0 : increment(1)");
    expect(firebaseChat).toContain("const storedUnreadCount = typeof data.unreadCount === \"number\"");
    expect(firebaseChat).toContain("const migratedUnreadCount = storedUnreadCount ??");
    expect(messages).toContain('[["all", "All"], ["unread", "Unread"]');
    expect(messages).toContain('chatFilter === "unread" && conversation.unreadCount > 0');
    expect(messages).toContain("aria-label={`${unreadLabel} unread messages`}");
    expect(messages).toContain("bg-[#D9A441]/20 px-2 py-1 text-[11px] font-bold leading-none text-[#D9A441]");
    expect(firebaseChat).toContain("markLatestMessageDelivered");
    expect(firebaseChat).toContain("markVisibleMessagesRead");
    expect(firebaseChat).toContain('if (document.visibilityState !== "visible") return;');
    expect(firebaseChat).toContain("receiptTimer = window.setTimeout(() => {");
    expect(firebaseChat).toContain("}, 600);");
    expect(firebaseChat).toContain("deliveredKeys.current.add(deliveryKey)");
    expect(firebaseChat).toContain('lastMessageStatus: "delivered"');
    expect(firebaseChat).toContain('lastMessageStatus: "read"');
    expect(firebaseChat).toContain('batch.set(doc(messageRef, "receipts", uid)');
    expect(messages).toContain("if (!selectedConversationId || !conversations.data?.length) return;");
    expect(messages).not.toContain("if (!selectedConversationId && conversations.data?.[0]) setSelectedConversationId");
    expect(styles).toContain("padding-left: 0.75rem !important;");
    expect(firestoreRules).toContain("'deliveredTo', 'readBy'");
    expect(firestoreRules).toContain("'receiptUpdatedAt'");
    expect(firestoreRules).toContain("'unreadCount'");
    expect(firestoreRules).toContain("'lastMessageId', 'lastMessageSenderId'");
    expect(firestoreRules).toContain("match /memories/{memoryId}");
    expect(firestoreRules).toContain("request.resource.data.sourceType in ['message', 'story']");
    expect(firestoreRules).toContain("'storyId', 'storyAuthorUserId'");
    expect(firestoreRules).toContain("'followUpLabel', 'followUpAction'");
    expect(firestoreRules).toContain("'followUpCompletedAt'");
    expect(firestoreRules).toContain("'embedding', 'embeddingModel', 'embeddingProvider'");
    expect(firestoreRules).toContain("'embeddingDimensions', 'embeddingUpdatedAt', 'semanticSummary'");
    expect(firestoreRules).toContain("'languageCode'");
    expect(firestoreRules).toContain("'replyToMessageId', 'replyToSenderId'");
    expect(firestoreRules).toContain("'reactions', 'reactionUpdatedAt', 'savedBy'");
    expect(firestoreRules).toContain("'pinnedBy', 'pinnedAt'");
    expect(firestoreRules).toContain("match /receipts/{uid}");
    expect(firestoreRules).toContain("request.resource.data.status in ['delivered', 'read']");
    expect(messages).not.toContain('previewStatus: "failed"');
    expect(messages).toContain('aria-label="Sent"');
    expect(messages).toContain('aria-label="Failed"');
    expect(messages).toContain('aria-label="Delivered"');
    expect(messages).toContain('aria-label="Read"');
    expect(messages).toContain('AnimatedSearchIcon size={16}');
    expect(messages).toContain('PlusIcon size={16}');
    expect(messages).toContain('PlusIcon size={20}');
    expect(messages).toContain('text-[#5f6861] dark:text-[#9AA1A6]');
    expect(stories).toContain('aria-label="Open profile"');
    expect(stories).toContain("<UserIcon size={22} />");
    expect(stories).not.toContain('onPointerDown={() => setSearchPulse(current => current + 1)}');
    expect(stories).not.toContain('AnimatedSearchIcon className="size-5" size={20} pulse={searchPulse}');
    expect(animatedIcons).toContain("export function AnimatedCheckCheckIcon");
    expect(animatedIcons).toContain("export function AnimatedCheckIcon");
    expect(animatedIcons).toContain("M5 14.5C5 14.5 6.5 14.5 8.5 18");
    expect(animatedIcons).toContain("M8 13.3333C8 13.3333 9.5 14 11.5 17");
    expect(animatedIcons).toContain("export function AnimatedPlusIcon");
    expect(animatedIcons).toContain("const PlusIcon = forwardRef");
    expect(animatedIcons).toContain("PlusIcon.displayName = \"PlusIcon\"");
    expect(animatedIcons).toContain("export { PlusIcon }");
    expect(animatedIcons).toContain("animate: { rotate: 180 }");
    expect(animatedIcons).toContain("onTouchStart={(event) =>");
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
    expect(profile).toContain("Chat memories");
    expect(profile).toContain("Upcoming follow-ups");
    expect(profile).toContain("upcomingFollowUps.map");
    expect(profile).toContain("Search your memories");
    expect(profile).toContain("savanna-memory-search-field");
    expect(profile).toContain("memoryTagOptions.map");
    expect(profile).toContain("No saved memories match this search.");
    expect(profile).toContain("Long-press a message on mobile or click a message bubble on web");
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
    expect(styles).toContain('.savanna-app [class~="overflow-x-auto"]');
    expect(styles).toContain(".savanna-app [class~=\"overflow-x-auto\"]::-webkit-scrollbar");
    expect(styles).toContain(".dark .savanna-app .savanna-profile-page .savanna-memory-search-field");
    expect(styles).toContain(".dark .savanna-app .savanna-profile-page .savanna-memory-search-field input");
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
    expect(firestoreRules).toContain("match /replies/{uid}");
    expect(firestoreRules).toContain("match /reactions/{reactionId}");
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
    expect(messages).toContain("savanna-desktop-messages grid h-screen max-h-screen overflow-hidden lg:grid-cols-[470px_minmax(0,1fr)]");
    expect(messages).toContain("const active = selectedConversationId === conversation.id;");
    expect(messages).toContain("data-active={active}");
    expect(styles).toContain("border-right: 1px solid var(--chat-border) !important;");
    expect(styles).toContain(".savanna-desktop-chat-rows .savanna-chat-row[data-active=\"true\"]");
    expect(styles).toContain(".dark .savanna-app .savanna-chat-row {");
    expect(styles).toContain(".dark .savanna-app .savanna-mobile-messages-canvas [role=\"tablist\"] [role=\"tab\"][aria-selected=\"true\"]");
    expect(styles).toContain(".savanna-app .savanna-collapsed-story-cluster button + button");
    expect(messages).toContain('aria-label="Desktop chat filters"');
    expect(messages).toContain("const filteredChatList = filteredConversations.filter");
    expect(messages).toContain('PlusIcon size={16}');
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
    expect(styles).toContain('.dark body .savanna-app .savanna-message-bubble.savanna-outgoing-message :is(p, span)');
    expect(styles).toContain('color: #FDFBF5 !important;');
    expect(styles.indexOf('.dark body .savanna-app .savanna-message-bubble.savanna-outgoing-message')).toBeGreaterThan(
      styles.indexOf('.dark .savanna-app .savanna-desktop-messages p,')
    );
    expect(styles).toContain('.dark .savanna-app .savanna-mobile-conversation .savanna-incoming-message {\n    background: var(--chat-search) !important;');
    expect(styles).toContain('.savanna-app .savanna-chat-glass-header');
    expect(styles).toContain('.dark .savanna-app .savanna-chat-glass-header');
    expect(messages).toContain('className="savanna-mobile-chat-header"');
    expect(messages).toContain('className="savanna-desktop-chat-header gap-3 px-6 py-4"');
    expect(styles).toContain('.savanna-app .savanna-mobile-chat-header.savanna-chat-glass-header');
    expect(styles).toContain('.savanna-app .savanna-desktop-chat-header.savanna-chat-glass-header');
    expect(styles).toContain('.dark .savanna-app .savanna-desktop-chat-header.savanna-chat-glass-header');
    expect(styles).toContain('position: absolute;');
    expect(styles).toContain('top: 0;');
    expect(styles).toContain('border-radius: 0 !important;');
    expect(styles).toContain('padding: calc(env(safe-area-inset-top) + 0.625rem) 0.75rem 0.625rem !important;');
    expect(styles).toContain('padding-top: 6.25rem !important;');
    expect(styles).toContain('scroll-padding-bottom: 7rem !important;');
    expect(styles).toContain('padding-top: calc(4.75rem + env(safe-area-inset-top)) !important;');
    expect(styles).toContain('padding-bottom: calc(var(--savanna-mobile-composer-height, 76px) + max(1rem, env(safe-area-inset-bottom)) + 1rem) !important;');
    expect(styles).toContain('.savanna-app .savanna-desktop-composer {\n    position: absolute;');
    expect(styles).toContain('background-color: transparent !important;');
    expect(styles).toContain(':root:not(.dark) .savanna-app .savanna-mobile-conversation .savanna-mobile-composer');
    expect(styles).toContain('.dark .savanna-app .savanna-mobile-conversation .savanna-mobile-composer');
    expect(styles).toContain('.dark .savanna-app .savanna-mobile-composer .savanna-composer-field');
    expect(styles).toContain(':root[data-wallpaper] body .savanna-app .savanna-community-chat-room');
    expect(styles).toContain('.dark[data-wallpaper] body .savanna-app .savanna-community-chat-room');
    expect(styles).toContain(':root[data-wallpaper] body .savanna-app .savanna-community-composer');
    expect(styles).toContain('.dark[data-wallpaper] body .savanna-app .savanna-community-composer');
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
    expect(styles).toContain('.savanna-app .savanna-message-bubble.savanna-outgoing-message [aria-label="Delivered"]');
    expect(styles).toContain("color: rgba(255, 255, 255, 0.92) !important;");
    expect(styles).toContain("height: var(--savanna-visual-viewport-height, 100dvh) !important;");
    expect(styles).toContain("scroll-padding-bottom: calc(var(--savanna-mobile-composer-height, 76px) + env(safe-area-inset-bottom)) !important;");

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
