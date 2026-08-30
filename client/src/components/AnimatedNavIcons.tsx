import { cn } from "@/lib/utils";
import { LazyMotion, domMin, m, motion, type Variants, useAnimation, useAnimationControls, useReducedMotion } from "framer-motion";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type HTMLAttributes, type MouseEvent } from "react";

export type MobileNavIconName = "Home" | "Messages" | "Shops" | "Learn" | "Stories" | "Communities" | "Orders" | "Profile";

type AnimatedIconProps = {
  size?: number;
  className?: string;
  "aria-label"?: string;
  pulse?: number;
};

type MobileNavIconProps = {
  name: MobileNavIconName;
  active: boolean;
  size?: number;
};

export interface SendHorizontalIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export interface UserIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export interface ShoppingBasketIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface SendHorizontalIconProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  | "color"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
> {
  size?: number;
  duration?: number;
  isAnimated?: boolean;
  color?: string;
}

interface UserIconProps extends SendHorizontalIconProps {}

interface ShoppingBasketIconProps extends SendHorizontalIconProps {}

interface BookTextIconProps extends SendHorizontalIconProps {}

const iconTransition = { duration: 0.42, ease: [0.23, 1, 0.32, 1] as const };

function iconAccessibilityProps(props: AnimatedIconProps) {
  return props["aria-label"] ? { role: "img" as const } : { "aria-hidden": true as const };
}

export function AnimatedCheckCheckIcon({ size = 14, ...props }: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const state = reducedMotion ? "idle" : "complete";

  return (
    <motion.svg {...iconAccessibilityProps(props)} {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <motion.path d="M18 6 7 17l-5-5" strokeDasharray="20" initial="idle" animate={state} variants={{ idle: { strokeDashoffset: 0, scale: 1, opacity: 1 }, complete: { strokeDashoffset: [20, 0], scale: [0.96, 1.16, 1], opacity: [0.5, 1] } }} transition={{ duration: 0.36, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "10px 12px" }} />
      <motion.path d="m22 10-7.5 7.5L13 16" strokeDasharray="20" initial="idle" animate={state} variants={{ idle: { opacity: 1, x: 0 }, complete: { opacity: [0, 1], x: [-4, 0] } }} transition={{ duration: 0.28, delay: 0.16, ease: [0.23, 1, 0.32, 1] }} />
    </motion.svg>
  );
}

export function AnimatedPlusIcon({ size = 18, ...props }: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const interactiveMotion = reducedMotion ? {} : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  return (
    <motion.svg {...iconAccessibilityProps(props)} {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial="idle" {...interactiveMotion} variants={{ idle: { scale: 1, rotate: 0 }, active: { scale: [1, 1.16, 0.92, 1], rotate: [0, 8, -8, 0] } }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
      <motion.path d="M5 12h14" variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.35, 1], opacity: [0.55, 1] } }} />
      <motion.path d="M12 5v14" variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.35, 1], opacity: [0.55, 1] } }} transition={{ delay: 0.04 }} />
    </motion.svg>
  );
}

export function AnimatedSearchIcon({ size = 18, pulse = 0, ...props }: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();
  const interactiveMotion = reducedMotion ? {} : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  useEffect(() => {
    if (!pulse || reducedMotion) return;
    controls.start("active").then(() => controls.start("idle"));
  }, [controls, pulse, reducedMotion]);

  return (
    <motion.svg {...iconAccessibilityProps(props)} {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial="idle" animate={controls} {...interactiveMotion}>
      <motion.g variants={{ idle: { x: 0, y: 0, rotate: 0 }, active: { x: [0, 1.6, -1.6, 0], y: [0, -0.8, 1.4, 0], rotate: [0, 5, -5, 0] } }} transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "11px 11px" }}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.34-4.34" />
      </motion.g>
    </motion.svg>
  );
}

const SendHorizontalIcon = forwardRef<SendHorizontalIconHandle, SendHorizontalIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 24,
      duration = 1,
      isAnimated = true,
      color,
      style,
      ...props
    },
    ref
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => reduced ? controls.start("normal") : controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback((event?: MouseEvent<HTMLDivElement>) => {
      if (!isAnimated || reduced) return;
      if (!isControlled.current) controls.start("animate");
      else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
    }, [controls, isAnimated, onMouseEnter, reduced]);

    const handleLeave = useCallback((event: MouseEvent<HTMLDivElement>) => {
      if (!isControlled.current) {
        controls.start("normal");
      } else {
        onMouseLeave?.(event);
      }
    }, [controls, onMouseLeave]);

    const svgVariants: Variants = {
      normal: { x: 0, scale: 1, opacity: 1 },
      animate: {
        scale: [1, 0.85, 0, 0, 1],
        x: [0, 6, 20, -20, 0],
        opacity: [1, 1, 0, 0, 1],
        transition: {
          duration: 1.4 * duration,
          ease: "easeInOut",
          times: [0, 0.2, 0.4, 0.6, 1],
        },
      },
    };

    return (
      <LazyMotion features={domMin} strict>
        <m.div
          className={cn("inline-flex items-center justify-center", className)}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          {...props}
          style={{ color, ...style }}
        >
          <m.svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={controls}
            initial="normal"
            variants={svgVariants}
            style={{ width: size, height: size, transformOrigin: "center" }}
          >
            <path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z" />
            <path d="M6 12h16" />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

SendHorizontalIcon.displayName = "SendHorizontalIcon";

export { SendHorizontalIcon };

const UserIcon = forwardRef<UserIconHandle, UserIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 24,
      duration = 1,
      isAnimated = true,
      color,
      style,
      ...props
    },
    ref
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => reduced ? controls.start("normal") : controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback((event?: MouseEvent<HTMLDivElement>) => {
      if (!isAnimated || reduced) return;
      if (!isControlled.current) controls.start("animate");
      else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
    }, [controls, isAnimated, onMouseEnter, reduced]);

    const handleLeave = useCallback((event: MouseEvent<HTMLDivElement>) => {
      if (!isControlled.current) {
        controls.start("normal");
      } else {
        onMouseLeave?.(event);
      }
    }, [controls, onMouseLeave]);

    const bodyVariants: Variants = {
      normal: { strokeDashoffset: 0, opacity: 1 },
      animate: {
        strokeDashoffset: [40, 0],
        opacity: [0.3, 1],
        transition: { duration: 0.6 * duration, ease: "easeInOut" },
      },
    };

    const headVariants: Variants = {
      normal: { scale: 1, opacity: 1 },
      animate: {
        scale: [0.6, 1.2, 1],
        opacity: [0, 1],
        transition: { duration: 0.5 * duration, ease: "easeOut", delay: 0.2 },
      },
    };

    return (
      <LazyMotion features={domMin} strict>
        <m.div
          className={cn("inline-flex items-center justify-center", className)}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          {...props}
          style={{ color, ...style }}
        >
          <m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-icon lucide-user">
            <m.path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" strokeDasharray="40" strokeDashoffset="0" variants={bodyVariants} initial="normal" animate={controls} />
            <m.circle cx="12" cy="7" r="4" variants={headVariants} initial="normal" animate={controls} />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

UserIcon.displayName = "UserIcon";

const ShoppingBasketIcon = forwardRef<ShoppingBasketIconHandle, ShoppingBasketIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 24,
      duration = 1,
      isAnimated = true,
      color,
      style,
      ...props
    },
    ref
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => reduced ? controls.start("normal") : controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback((event?: MouseEvent<HTMLDivElement>) => {
      if (!isAnimated || reduced) return;
      if (!isControlled.current) controls.start("animate");
      else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
    }, [controls, isAnimated, onMouseEnter, reduced]);

    const handleLeave = useCallback((event: MouseEvent<HTMLDivElement>) => {
      if (!isControlled.current) {
        controls.start("normal");
      } else {
        onMouseLeave?.(event);
      }
    }, [controls, onMouseLeave]);

    const bodyVariants: Variants = {
      normal: { pathLength: 1, opacity: 1 },
      animate: (index: number) => ({
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: {
          duration: 0.5 * duration,
          delay: index * 0.08 * duration,
          ease: [0.16, 1, 0.3, 1],
        },
      }),
    };

    return (
      <LazyMotion features={domMin} strict>
        <m.div
          className={cn("inline-flex items-center justify-center", className)}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          {...props}
          style={{ color, ...style }}
        >
          <m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={controls} initial="normal">
            <m.path d="M2 11h20" custom={0} variants={bodyVariants} />
            <m.path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" custom={0} variants={bodyVariants} />
            <m.path d="m5 11 4-7" custom={1} variants={bodyVariants} />
            <m.path d="m19 11-4-7" custom={1} variants={bodyVariants} />
            <m.path d="m9 11 1 9" custom={2} variants={bodyVariants} />
            <m.path d="m15 11-1 9" custom={2} variants={bodyVariants} />
            <m.path d="M4.5 15.5h15" custom={3} variants={bodyVariants} />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

ShoppingBasketIcon.displayName = "ShoppingBasketIcon";

export { ShoppingBasketIcon, UserIcon };

const BookTextIcon = forwardRef<SendHorizontalIconHandle, BookTextIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 28,
      isAnimated = true,
      color,
      style,
      ...props
    },
    ref
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => reduced ? controls.start("normal") : controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback((event?: MouseEvent<HTMLDivElement>) => {
      if (!isAnimated || reduced) return;
      if (!isControlled.current) controls.start("animate");
      else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
    }, [controls, isAnimated, onMouseEnter, reduced]);

    const handleLeave = useCallback((event: MouseEvent<HTMLDivElement>) => {
      if (!isControlled.current) {
        controls.start("normal");
      } else {
        onMouseLeave?.(event);
      }
    }, [controls, onMouseLeave]);

    const variants: Variants = {
      normal: {
        scale: 1,
        rotate: 0,
        y: 0,
      },
      animate: {
        scale: [1, 1.04, 1],
        rotate: [0, -8, 8, -8, 0],
        y: [0, -2, 0],
        transition: {
          duration: 0.6,
          ease: "easeInOut",
          times: [0, 0.2, 0.5, 0.8, 1],
        },
      },
    };

    return (
      <LazyMotion features={domMin} strict>
        <m.div
          className={cn("inline-flex items-center justify-center", className)}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          {...props}
          style={{ color, ...style }}
        >
          <m.svg animate={controls} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" variants={variants} viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg" initial="normal" style={{ overflow: "visible" }}>
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
            <path d="M8 11h8" />
            <path d="M8 7h6" />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

BookTextIcon.displayName = "BookTextIcon";

export { BookTextIcon };

export function AnimatedSendIcon({ size = 18, pulse = 0, ...props }: AnimatedIconProps) {
  const icon = useRef<SendHorizontalIconHandle>(null);

  useEffect(() => {
    if (!pulse) return;
    icon.current?.startAnimation();
  }, [pulse]);

  // Lucide's send-horizontal glyph points right; the conventional send
  // affordance is a plane angled up-and-right, so the whole glyph is rotated
  // 45° anticlockwise.
  //
  // The rotation deliberately lives on a plain span wrapper instead of the
  // motion element's inline style: framer-motion owns and rewrites `transform`
  // on the elements it controls, so an inline transform there is fragile — it
  // survives server rendering but can be clobbered on the client. See
  // `.savanna-send-icon` in index.css.
  return (
    <span className="savanna-send-icon">
      <SendHorizontalIcon ref={icon} size={size} {...props} />
    </span>
  );
}

export function AnimatedMenuIcon({ size = 20, pulse = 0, ...props }: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();
  const interactiveMotion = reducedMotion ? {} : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  useEffect(() => {
    if (!pulse || reducedMotion) return;
    controls.start("active").then(() => controls.start("idle"));
  }, [controls, pulse, reducedMotion]);

  return (
    <motion.svg {...iconAccessibilityProps(props)} {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial="idle" animate={controls} {...interactiveMotion}>
      <motion.path d="M4 6h16" variants={{ idle: { x: 0, scaleX: 1 }, active: { x: 3, scaleX: 0.85 } }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "4px 6px" }} />
      <motion.path d="M4 12h16" variants={{ idle: { x: 0, scaleX: 1 }, active: { x: 5, scaleX: 0.7 } }} transition={{ duration: 0.18, delay: 0.04, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "4px 12px" }} />
      <motion.path d="M4 18h16" variants={{ idle: { x: 0, scaleX: 1 }, active: { x: 7, scaleX: 0.55 } }} transition={{ duration: 0.18, delay: 0.08, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "4px 18px" }} />
    </motion.svg>
  );
}

export function AnimatedStoreIcon({ size = 18, pulse: _pulse, ...props }: AnimatedIconProps) {
  return <ShoppingBasketIcon size={size} {...props} />;
}

export function AnimatedBookOpenTextIcon({ size = 18, pulse: _pulse, ...props }: AnimatedIconProps) {
  return <BookTextIcon size={size} {...props} />;
}

export function AnimatedShoppingBagIcon({ size = 18, ...props }: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const interactiveMotion = reducedMotion ? {} : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  return (
    <motion.svg {...iconAccessibilityProps(props)} {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial="idle" {...interactiveMotion}>
      <motion.g variants={{ idle: { scaleX: 1, scaleY: 1, y: 0 }, active: { y: [-4, 0, 0], scaleY: [1, 0.86, 1.05, 1], scaleX: [1, 1.12, 0.98, 1] } }} transition={{ duration: 0.48, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "12px 22px" }}>
        <motion.path d="M16 10a4 4 0 0 1-8 0" variants={{ idle: { scale: 1, opacity: 1 }, active: { scale: [0.5, 1.15, 1], opacity: [0, 1, 1] } }} transition={{ ...iconTransition, delay: 0.1 }} style={{ transformBox: "view-box", transformOrigin: "12px 11px" }} />
        <path d="M3.1 6.03h17.8" />
        <path d="M3.4 5.47a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.67a2 2 0 0 0-.4-1.2l-2-2.67A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" />
      </motion.g>
    </motion.svg>
  );
}

export function MobileNavIcon({ name, active, size = 22 }: MobileNavIconProps) {
  const reducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const state = !reducedMotion && (hovered || pressed) ? "active" : "idle";
  const playPressAnimation = useCallback(() => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    setPressed(true);
    pressTimer.current = window.setTimeout(() => {
      setPressed(false);
      pressTimer.current = null;
    }, 760);
  }, []);
  const iconInteraction = reducedMotion ? {} : {
    onPointerEnter: () => { if (canHover) setHovered(true); },
    onPointerLeave: () => { setHovered(false); },
    onPointerDown: () => { if (!canHover) playPressAnimation(); },
    onTouchStart: () => { if (!canHover) playPressAnimation(); },
    onFocus: () => { if (canHover) setHovered(true); },
    onBlur: () => { setHovered(false); },
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncHoverCapability = () => setCanHover(hoverQuery.matches);
    syncHoverCapability();
    hoverQuery.addEventListener("change", syncHoverCapability);
    return () => hoverQuery.removeEventListener("change", syncHoverCapability);
  }, []);

  useEffect(() => () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  }, []);

  if (name === "Home") {
    return (
      <motion.svg aria-hidden="true" data-active={active} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }} {...iconInteraction}>
        <motion.path d="M3 10.8 12 3l9 7.8" initial="idle" animate={state} variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.2, 1], opacity: [0.35, 1] } }} transition={iconTransition} />
        <motion.path d="M5.5 10.5V20h13v-9.5" initial="idle" animate={state} variants={{ idle: { y: 0, opacity: 1 }, active: { y: [1.5, 0], opacity: [0.45, 1] } }} transition={{ ...iconTransition, delay: 0.08 }} />
        <motion.path d="M9.5 20v-5.5h5V20" initial="idle" animate={state} variants={{ idle: { scaleY: 1, opacity: 1 }, active: { scaleY: [0.25, 1], opacity: [0, 1] } }} transition={{ ...iconTransition, delay: 0.16 }} style={{ transformBox: "view-box", transformOrigin: "12px 20px" }} />
      </motion.svg>
    );
  }

  if (name === "Messages") {
    return (
      <motion.svg aria-hidden="true" data-active={active} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }} {...iconInteraction}>
        <motion.path d="M3.2 16.2a2 2 0 0 1 .1 1.15l-1.05 3.25a1 1 0 0 0 1.23 1.17l3.38-1a2 2 0 0 1 1.1.1 10 10 0 1 0-4.75-4.67" initial="idle" animate={state} variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.28, 1], opacity: [0.35, 1] } }} transition={iconTransition} />
        {[8, 12, 16].map((x, index) => <motion.path key={x} d={`M${x} 12h.01`} initial="idle" animate={state} variants={{ idle: { scale: 1, opacity: 1 }, active: { scale: [0, 1.28, 1], opacity: [0, 1, 1] } }} transition={{ ...iconTransition, delay: 0.12 + index * 0.08 }} style={{ transformBox: "view-box", transformOrigin: `${x}px 12px` }} />)}
      </motion.svg>
    );
  }

  if (name === "Shops") {
    return (
      <motion.svg aria-hidden="true" data-active={active} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }} {...iconInteraction}>
        {[
          "M2 11h20",
          "m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4",
          "m5 11 4-7",
          "m19 11-4-7",
          "m9 11 1 9",
          "m15 11-1 9",
          "M4.5 15.5h15",
        ].map((path, index) => <motion.path key={path} d={path} initial="idle" animate={state} variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0, 1], opacity: [0, 1] } }} transition={{ duration: 0.5, delay: Math.min(index, 3) * 0.08, ease: [0.16, 1, 0.3, 1] }} />)}
      </motion.svg>
    );
  }

  if (name === "Learn") {
    return (
      <motion.svg aria-hidden="true" data-active={active} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }} {...iconInteraction}>
        <motion.g initial="idle" animate={state} variants={{ idle: { scale: 1, rotate: 0, y: 0 }, active: { scale: [1, 1.04, 1], rotate: [0, -8, 8, -8, 0], y: [0, -2, 0] } }} transition={{ duration: 0.6, ease: "easeInOut", times: [0, 0.2, 0.5, 0.8, 1] }} style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
          <path d="M8 11h8" />
          <path d="M8 7h6" />
        </motion.g>
      </motion.svg>
    );
  }

  if (name === "Stories") {
    const movingLineVariants: Variants = {
      idle: { y: 0, opacity: 1 },
      active: {
        y: [0, -4.5, 0, -4.5, 0],
        opacity: [1, 0.35, 1, 0.35, 1],
      },
    };

    return (
      <motion.svg aria-hidden="true" data-active={active} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }} {...iconInteraction}>
        <motion.g initial="idle" animate={state} variants={{ idle: { scale: 1 }, active: { scale: [1, 1.03, 1] } }} transition={{ duration: 0.62, ease: "easeInOut" }} style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}>
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 3v18" />
          <path d="M17 3v18" />
          {[
            "M3 7.5h4",
            "M17 7.5h4",
            "M3 12h18",
            "M3 16.5h4",
            "M17 16.5h4",
          ].map((path, index) => (
            <motion.path
              key={path}
              d={path}
              initial="idle"
              animate={state}
              variants={movingLineVariants}
              transition={{ duration: 0.72, delay: index * 0.035, ease: "easeInOut", times: [0, 0.22, 0.45, 0.68, 1] }}
            />
          ))}
        </motion.g>
      </motion.svg>
    );
  }

  if (name === "Communities") {
    const frontBubbleVariants: Variants = {
      idle: { x: 0, opacity: 1 },
      active: { x: [-5, 0], opacity: [0.45, 1] },
    };
    const backBubbleVariants: Variants = {
      idle: { x: 0, opacity: 1 },
      active: { x: [5, 0], opacity: [0.45, 1] },
    };

    return (
      <motion.svg
        aria-hidden="true"
        data-active={active}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ overflow: "visible" }}
        {...iconInteraction}
      >
        <motion.g initial="idle" animate={state} variants={backBubbleVariants} transition={{ duration: 0.44, ease: [0.23, 1, 0.32, 1] }}>
          <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
        </motion.g>
        <motion.g initial="idle" animate={state} variants={frontBubbleVariants} transition={{ duration: 0.44, ease: [0.23, 1, 0.32, 1] }}>
          <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
        </motion.g>
      </motion.svg>
    );
  }

  if (name === "Profile") {
    return (
      <motion.svg aria-hidden="true" data-active={active} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...iconInteraction}>
        <motion.path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" strokeDasharray="40" initial="idle" animate={state} variants={{ idle: { strokeDashoffset: 0, opacity: 1 }, active: { strokeDashoffset: [40, 0], opacity: [0.3, 1] } }} transition={{ duration: 0.6, ease: "easeInOut" }} />
        <motion.circle cx="12" cy="7" r="4" initial="idle" animate={state} variants={{ idle: { scale: 1, opacity: 1 }, active: { scale: [0.6, 1.2, 1], opacity: [0, 1] } }} transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }} style={{ transformBox: "view-box", transformOrigin: "12px 7px" }} />
      </motion.svg>
    );
  }

  return (
    <motion.svg aria-hidden="true" data-active={active} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...iconInteraction}>
      <motion.g initial="idle" animate={state} variants={{ idle: { scaleX: 1, scaleY: 1, y: 0 }, active: { y: [-4, 0, 0], scaleY: [1, 0.86, 1.05, 1], scaleX: [1, 1.12, 0.98, 1] } }} transition={{ duration: 0.48, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "12px 22px" }}>
        <motion.path d="M16 10a4 4 0 0 1-8 0" initial="idle" animate={state} variants={{ idle: { scale: 1, opacity: 1 }, active: { scale: [0.5, 1.15, 1], opacity: [0, 1, 1] } }} transition={{ ...iconTransition, delay: 0.1 }} style={{ transformBox: "view-box", transformOrigin: "12px 11px" }} />
        <path d="M3.1 6.03h17.8" />
        <path d="M3.4 5.47a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.67a2 2 0 0 0-.4-1.2l-2-2.67A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" />
      </motion.g>
    </motion.svg>
  );
}
