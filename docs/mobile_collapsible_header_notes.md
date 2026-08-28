# Mobile Collapsible Header Notes

Savanna’s mobile Stories treatment should preserve a single page scroll surface and let the header respond to that surface rather than intercepting ordinary scrolling. The revised implementation uses a sticky header with two visual states: an expanded Stories rail only at the top of the page and a compact avatar-only rail immediately after scrolling begins. The UI changes with CSS transitions on height, spacing, and opacity rather than modifying page layout continuously during a gesture.

This approach follows the general coordinated-scroll principle described by Android’s nested-scroll guidance and avoids high-frequency geometry work that the Intersection Observer guidance identifies as a historical performance concern. The user’s supplied reference is the visual source of truth for the compact state: a short, horizontal avatar rail beneath the app bar with no large label or explanatory text.

References: [MDN Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API); [Android Developers, nested scrolling modifiers](https://developer.android.com/develop/ui/compose/touch-input/scroll/nested-scroll-modifiers).

## Repository pattern applied

The supplied `react-native-tab-view-collapsible-header` repository exposes a caller-owned `renderScrollHeader` with an explicit expanded `makeHeaderHeight`, then coordinates its offset across the content tabs. Savanna applies the equivalent web pattern without importing React Native: the shared mobile app bar stays sticky, the Stories rail owns a discrete expanded height and a compact height, and a single scroll source switches visual states at the first positive scroll offset. The expanded state shows the avatar rail and labels; the compact state preserves a short, avatar-first rail below the application bar so the content does not jump or compete with scrolling.

Reference: [zyslife/react-native-tab-view-collapsible-header](https://github.com/zyslife/react-native-tab-view-collapsible-header).
