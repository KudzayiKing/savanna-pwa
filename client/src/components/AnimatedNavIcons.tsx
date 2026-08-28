import { cn } from "@/lib/utils";
import { LazyMotion, domMin, m, motion, type Variants, useAnimation, useAnimationControls, useReducedMotion } from "framer-motion";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type HTMLAttributes, type MouseEvent } from "react";

export type MobileNavIconName = "Messages" | "Shops" | "Learn" | "Orders" | "Profile";

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
          style={{ color, transform: "rotate(-45deg)", ...style }}
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

export function AnimatedSendIcon({ size = 18, pulse = 0, ...props }: AnimatedIconProps) {
  const icon = useRef<SendHorizontalIconHandle>(null);

  useEffect(() => {
    if (!pulse) return;
    icon.current?.startAnimation();
  }, [pulse]);

  return <SendHorizontalIcon ref={icon} size={size} {...props} />;
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

export function AnimatedStoreIcon({ size = 18, ...props }: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const interactiveMotion = reducedMotion ? {} : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  return (
    <motion.svg {...iconAccessibilityProps(props)} {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial="idle" {...interactiveMotion}>
      <motion.path d="M17.75 10.3a1.12 1.12 0 0 0-1.55 0 2.5 2.5 0 0 1-3.45 0 1.12 1.12 0 0 0-1.55 0 2.5 2.5 0 0 1-3.45 0 1.12 1.12 0 0 0-1.55 0 2.5 2.5 0 0 1-3.77-3.25l2.89-4.18A2 2 0 0 1 7 2h10a2 2 0 0 1 1.65.87l2.9 4.19a2.5 2.5 0 0 1-3.8 3.24" variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0, 1], opacity: [0.3, 1] } }} transition={iconTransition} />
      <motion.path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.15, 1], opacity: [0.4, 1] } }} transition={{ ...iconTransition, delay: 0.07 }} />
      <motion.path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" variants={{ idle: { scaleY: 1, opacity: 1 }, active: { scaleY: [0, 1.12, 1], opacity: [0, 1, 1] } }} transition={{ ...iconTransition, delay: 0.18 }} style={{ transformBox: "view-box", transformOrigin: "12px 21px" }} />
    </motion.svg>
  );
}

export function AnimatedBookOpenTextIcon({ size = 18, ...props }: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const interactiveMotion = reducedMotion ? {} : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  return (
    <motion.svg {...iconAccessibilityProps(props)} {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial="idle" {...interactiveMotion}>
      <motion.g variants={{ idle: { scale: 1, rotate: 0 }, active: { scale: [1, 1.04, 0.98, 1], rotate: [0, -2, 2, 0] } }} transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}>
        <motion.path d="M12 7v14" variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.45, 1], opacity: [0.6, 1] } }} transition={iconTransition} />
        {[[16, 12], [16, 8], [6, 12], [6, 8]].map(([x, y], index) => <motion.path key={`${x}-${y}`} d={`M${x} ${y}h2`} variants={{ idle: { opacity: 1, y: 0, scaleX: 1 }, active: { opacity: [0.55, 1], y: [1, -0.75, 0], scaleX: [0.9, 1.05, 1] } }} transition={{ ...iconTransition, delay: 0.08 + index * 0.04 }} style={{ transformBox: "view-box", transformOrigin: `${x + 1}px ${y}px` }} />)}
        <motion.path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.75, 1], opacity: [0.6, 1] } }} transition={{ ...iconTransition, delay: 0.05 }} />
      </motion.g>
    </motion.svg>
  );
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
  const state = !reducedMotion && (active || hovered) ? "active" : "idle";
  const hoverMotion = reducedMotion ? {} : { onPointerEnter: () => setHovered(true), onPointerLeave: () => setHovered(false), onFocus: () => setHovered(true), onBlur: () => setHovered(false) };

  if (name === "Messages") {
    return (
      <motion.svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...hoverMotion}>
        <motion.path d="M3.2 16.2a2 2 0 0 1 .1 1.15l-1.05 3.25a1 1 0 0 0 1.23 1.17l3.38-1a2 2 0 0 1 1.1.1 10 10 0 1 0-4.75-4.67" initial="idle" animate={state} variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.28, 1], opacity: [0.35, 1] } }} transition={iconTransition} />
        {[8, 12, 16].map((x, index) => <motion.path key={x} d={`M${x} 12h.01`} initial="idle" animate={state} variants={{ idle: { scale: 1, opacity: 1 }, active: { scale: [0, 1.28, 1], opacity: [0, 1, 1] } }} transition={{ ...iconTransition, delay: 0.12 + index * 0.08 }} style={{ transformBox: "view-box", transformOrigin: `${x}px 12px` }} />)}
      </motion.svg>
    );
  }

  if (name === "Shops") {
    return (
      <motion.svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...hoverMotion}>
        <motion.path d="M17.75 10.3a1.12 1.12 0 0 0-1.55 0 2.5 2.5 0 0 1-3.45 0 1.12 1.12 0 0 0-1.55 0 2.5 2.5 0 0 1-3.45 0 1.12 1.12 0 0 0-1.55 0 2.5 2.5 0 0 1-3.77-3.25l2.89-4.18A2 2 0 0 1 7 2h10a2 2 0 0 1 1.65.87l2.9 4.19a2.5 2.5 0 0 1-3.8 3.24" initial="idle" animate={state} variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0, 1], opacity: [0.3, 1] } }} transition={iconTransition} />
        <motion.path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" initial="idle" animate={state} variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.15, 1], opacity: [0.4, 1] } }} transition={{ ...iconTransition, delay: 0.07 }} />
        <motion.path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" initial="idle" animate={state} variants={{ idle: { scaleY: 1, opacity: 1 }, active: { scaleY: [0, 1.12, 1], opacity: [0, 1, 1] } }} transition={{ ...iconTransition, delay: 0.18 }} style={{ transformBox: "view-box", transformOrigin: "12px 21px" }} />
      </motion.svg>
    );
  }

  if (name === "Learn") {
    return (
      <motion.svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...hoverMotion}>
        <motion.g initial="idle" animate={state} variants={{ idle: { scale: 1, rotate: 0 }, active: { scale: [1, 1.05, 0.98, 1], rotate: [0, -2, 2, 0] } }} transition={{ duration: 0.52, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}>
          <motion.path d="M12 7v14" variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.45, 1], opacity: [0.6, 1] } }} transition={iconTransition} />
          {[[16, 12], [16, 8], [6, 12], [6, 8]].map(([x, y], index) => <motion.path key={`${x}-${y}`} d={`M${x} ${y}h2`} variants={{ idle: { opacity: 1, y: 0, scaleX: 1 }, active: { opacity: [0.55, 1], y: [1, -0.75, 0], scaleX: [0.9, 1.05, 1] } }} transition={{ ...iconTransition, delay: 0.08 + index * 0.04 }} style={{ transformBox: "view-box", transformOrigin: `${x + 1}px ${y}px` }} />)}
          <motion.path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0.75, 1], opacity: [0.6, 1] } }} transition={{ ...iconTransition, delay: 0.05 }} />
        </motion.g>
      </motion.svg>
    );
  }

  if (name === "Profile") {
    return (
      <motion.svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...hoverMotion}>
        <motion.circle cx="12" cy="8" r="4" initial="idle" animate={state} variants={{ idle: { scale: 1, opacity: 1 }, active: { scale: [0.5, 1.14, 1], opacity: [0.25, 1, 1] } }} transition={iconTransition} style={{ transformBox: "view-box", transformOrigin: "12px 8px" }} />
        <motion.path d="M4 21a8 8 0 0 1 16 0" initial="idle" animate={state} variants={{ idle: { pathLength: 1, opacity: 1 }, active: { pathLength: [0, 1], opacity: [0.25, 1] } }} transition={{ ...iconTransition, delay: 0.12 }} />
      </motion.svg>
    );
  }

  return (
    <motion.svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...hoverMotion}>
      <motion.g initial="idle" animate={state} variants={{ idle: { scaleX: 1, scaleY: 1, y: 0 }, active: { y: [-4, 0, 0], scaleY: [1, 0.86, 1.05, 1], scaleX: [1, 1.12, 0.98, 1] } }} transition={{ duration: 0.48, ease: [0.23, 1, 0.32, 1] }} style={{ transformBox: "view-box", transformOrigin: "12px 22px" }}>
        <motion.path d="M16 10a4 4 0 0 1-8 0" initial="idle" animate={state} variants={{ idle: { scale: 1, opacity: 1 }, active: { scale: [0.5, 1.15, 1], opacity: [0, 1, 1] } }} transition={{ ...iconTransition, delay: 0.1 }} style={{ transformBox: "view-box", transformOrigin: "12px 11px" }} />
        <path d="M3.1 6.03h17.8" />
        <path d="M3.4 5.47a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.67a2 2 0 0 0-.4-1.2l-2-2.67A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" />
      </motion.g>
    </motion.svg>
  );
}
