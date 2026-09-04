import { cn } from "@/lib/utils";
import {
  LazyMotion,
  domMin,
  m,
  motion,
  type Variants,
  useAnimation,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent,
} from "react";

export type MobileNavIconName =
  | "Home"
  | "Messages"
  | "Shops"
  | "Learn"
  | "Stories"
  | "Communities"
  | "Orders"
  | "Profile";

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

export interface PlusIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface SendHorizontalIconProps
  extends Omit<
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

interface PlusIconProps
  extends Omit<
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
  isAnimated?: boolean;
  color?: string;
}

const iconTransition = { duration: 0.42, ease: [0.23, 1, 0.32, 1] as const };

function iconAccessibilityProps(props: AnimatedIconProps) {
  return props["aria-label"]
    ? { role: "img" as const }
    : { "aria-hidden": true as const };
}

export function AnimatedCheckIcon({
  size = 14,
  pulse = 1,
  ...props
}: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();

  useEffect(() => {
    if (reducedMotion) return;
    controls.start("animate").then(() => controls.start("normal"));
  }, [controls, pulse, reducedMotion]);

  return (
    <motion.svg
      {...iconAccessibilityProps(props)}
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <motion.path
        d="M5 14.5C5 14.5 6.5 14.5 8.5 18C8.5 18 14.0588 8.83333 19 7"
        strokeDasharray="24"
        strokeDashoffset="0"
        initial="normal"
        animate={controls}
        variants={{
          normal: { strokeDashoffset: 0, scale: 1, opacity: 1 },
          animate: {
            strokeDashoffset: [24, 0],
            scale: [1, 1.15, 1],
            opacity: [0.5, 1],
          },
        }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
      />
    </motion.svg>
  );
}

export function AnimatedCheckCheckIcon({
  size = 14,
  pulse = 1,
  ...props
}: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();

  useEffect(() => {
    if (reducedMotion) return;
    controls.start("animate").then(() => controls.start("normal"));
  }, [controls, pulse, reducedMotion]);

  return (
    <motion.svg
      {...iconAccessibilityProps(props)}
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <motion.path
        d="M3 13.3333C3 13.3333 4.5 14 6.5 17C6.5 17 6.78485 16.5192 7.32133 15.7526M17 6C14.7085 7.14577 12.3119 9.55181 10.3879 11.8223"
        strokeDasharray="26"
        strokeDashoffset="0"
        initial="normal"
        animate={controls}
        variants={{
          normal: { strokeDashoffset: 0, scale: 1, opacity: 1 },
          animate: {
            strokeDashoffset: [26, 0],
            scale: [1, 1.15, 1],
            opacity: [0.5, 1],
          },
        }}
        transition={{ duration: 0.7, ease: "easeInOut" }}
        style={{ transformBox: "view-box", transformOrigin: "10px 12px" }}
      />
      <motion.path
        d="M8 13.3333C8 13.3333 9.5 14 11.5 17C11.5 17 17 8.5 22 6"
        initial="normal"
        animate={controls}
        variants={{
          normal: { opacity: 1, x: 0 },
          animate: { opacity: [0, 1], x: [-6, 0] },
        }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.35 }}
      />
    </motion.svg>
  );
}

export function AnimatedPlusIcon({ size = 18, ...props }: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const interactiveMotion = reducedMotion
    ? {}
    : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  return (
    <motion.svg
      {...iconAccessibilityProps(props)}
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial="idle"
      {...interactiveMotion}
      variants={{
        idle: { scale: 1, rotate: 0 },
        active: { scale: [1, 1.16, 0.92, 1], rotate: [0, 8, -8, 0] },
      }}
      transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.path
        d="M5 12h14"
        variants={{
          idle: { pathLength: 1, opacity: 1 },
          active: { pathLength: [0.35, 1], opacity: [0.55, 1] },
        }}
      />
      <motion.path
        d="M12 5v14"
        variants={{
          idle: { pathLength: 1, opacity: 1 },
          active: { pathLength: [0.35, 1], opacity: [0.55, 1] },
        }}
        transition={{ delay: 0.04 }}
      />
    </motion.svg>
  );
}

const PlusIcon = forwardRef<PlusIconHandle, PlusIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      onPointerDown,
      onTouchStart,
      onFocus,
      onBlur,
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
    const restoreTimer = useRef<number | null>(null);

    const animateOnce = useCallback(() => {
      if (!isAnimated || reduced) return;
      if (restoreTimer.current) window.clearTimeout(restoreTimer.current);
      void controls.start("animate");
      restoreTimer.current = window.setTimeout(() => {
        void controls.start("normal");
        restoreTimer.current = null;
      }, 520);
    }, [controls, isAnimated, reduced]);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () =>
          reduced ? controls.start("normal") : controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    useEffect(
      () => () => {
        if (restoreTimer.current) window.clearTimeout(restoreTimer.current);
      },
      []
    );

    const handleEnter = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (isControlled.current) onMouseEnter?.(event);
        else animateOnce();
      },
      [animateOnce, onMouseEnter]
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (isControlled.current) {
          onMouseLeave?.(event);
        } else {
          void controls.start("normal");
        }
      },
      [controls, onMouseLeave]
    );

    return (
      <LazyMotion features={domMin} strict>
        <m.div
          className={cn("inline-flex items-center justify-center", className)}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          onPointerDown={event => {
            if (!isControlled.current) animateOnce();
            onPointerDown?.(event);
          }}
          onTouchStart={event => {
            if (!isControlled.current) animateOnce();
            onTouchStart?.(event);
          }}
          onFocus={event => {
            if (!isControlled.current) animateOnce();
            onFocus?.(event);
          }}
          onBlur={event => {
            if (!isControlled.current) void controls.start("normal");
            onBlur?.(event);
          }}
          {...props}
          style={{ color, ...style }}
        >
          <m.svg
            animate={controls}
            fill="none"
            height={size}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            variants={{
              normal: { rotate: 0 },
              animate: { rotate: 180 },
            }}
            initial="normal"
            viewBox="0 0 24 24"
            width={size}
            xmlns="http://www.w3.org/2000/svg"
            style={{ transformOrigin: "center", overflow: "visible" }}
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

PlusIcon.displayName = "PlusIcon";

export { PlusIcon };

export function AnimatedSearchIcon({
  size = 18,
  pulse = 0,
  ...props
}: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();
  const interactiveMotion = reducedMotion
    ? {}
    : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  useEffect(() => {
    if (!pulse || reducedMotion) return;
    controls.start("active").then(() => controls.start("idle"));
  }, [controls, pulse, reducedMotion]);

  return (
    <motion.svg
      {...iconAccessibilityProps(props)}
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial="idle"
      animate={controls}
      {...interactiveMotion}
    >
      <motion.g
        variants={{
          idle: { x: 0, y: 0, rotate: 0 },
          active: {
            x: [0, 1.6, -1.6, 0],
            y: [0, -0.8, 1.4, 0],
            rotate: [0, 5, -5, 0],
          },
        }}
        transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformBox: "view-box", transformOrigin: "11px 11px" }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.34-4.34" />
      </motion.g>
    </motion.svg>
  );
}

const SendHorizontalIcon = forwardRef<
  SendHorizontalIconHandle,
  SendHorizontalIconProps
>(
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
        startAnimation: () =>
          reduced ? controls.start("normal") : controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback(
      (event?: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) controls.start("animate");
        else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
      },
      [controls, isAnimated, onMouseEnter, reduced]
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          controls.start("normal");
        } else {
          onMouseLeave?.(event);
        }
      },
      [controls, onMouseLeave]
    );

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
        startAnimation: () =>
          reduced ? controls.start("normal") : controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback(
      (event?: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) controls.start("animate");
        else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
      },
      [controls, isAnimated, onMouseEnter, reduced]
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          controls.start("normal");
        } else {
          onMouseLeave?.(event);
        }
      },
      [controls, onMouseLeave]
    );

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
            className="lucide lucide-user-icon lucide-user"
          >
            <m.path
              d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
              strokeDasharray="40"
              strokeDashoffset="0"
              variants={bodyVariants}
              initial="normal"
              animate={controls}
            />
            <m.circle
              cx="12"
              cy="7"
              r="4"
              variants={headVariants}
              initial="normal"
              animate={controls}
            />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

UserIcon.displayName = "UserIcon";

const ShoppingBasketIcon = forwardRef<
  ShoppingBasketIconHandle,
  ShoppingBasketIconProps
>(
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
        startAnimation: () =>
          reduced ? controls.start("normal") : controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback(
      (event?: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) controls.start("animate");
        else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
      },
      [controls, isAnimated, onMouseEnter, reduced]
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          controls.start("normal");
        } else {
          onMouseLeave?.(event);
        }
      },
      [controls, onMouseLeave]
    );

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
          >
            <m.path d="M2 11h20" custom={0} variants={bodyVariants} />
            <m.path
              d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"
              custom={0}
              variants={bodyVariants}
            />
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
        startAnimation: () =>
          reduced ? controls.start("normal") : controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback(
      (event?: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) controls.start("animate");
        else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
      },
      [controls, isAnimated, onMouseEnter, reduced]
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          controls.start("normal");
        } else {
          onMouseLeave?.(event);
        }
      },
      [controls, onMouseLeave]
    );

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
          <m.svg
            animate={controls}
            fill="none"
            height={size}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            variants={variants}
            viewBox="0 0 24 24"
            width={size}
            xmlns="http://www.w3.org/2000/svg"
            initial="normal"
            style={{ overflow: "visible" }}
          >
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

export function AnimatedSendIcon({
  size = 18,
  pulse = 0,
  ...props
}: AnimatedIconProps) {
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

export function AnimatedMenuIcon({
  size = 20,
  pulse = 0,
  ...props
}: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();
  const interactiveMotion = reducedMotion
    ? {}
    : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  useEffect(() => {
    if (!pulse || reducedMotion) return;
    controls.start("active").then(() => controls.start("idle"));
  }, [controls, pulse, reducedMotion]);

  return (
    <motion.svg
      {...iconAccessibilityProps(props)}
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial="idle"
      animate={controls}
      {...interactiveMotion}
    >
      <motion.path
        d="M4 6h16"
        variants={{ idle: { x: 0, scaleX: 1 }, active: { x: 3, scaleX: 0.85 } }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformBox: "view-box", transformOrigin: "4px 6px" }}
      />
      <motion.path
        d="M4 12h16"
        variants={{ idle: { x: 0, scaleX: 1 }, active: { x: 5, scaleX: 0.7 } }}
        transition={{ duration: 0.18, delay: 0.04, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformBox: "view-box", transformOrigin: "4px 12px" }}
      />
      <motion.path
        d="M4 18h16"
        variants={{ idle: { x: 0, scaleX: 1 }, active: { x: 7, scaleX: 0.55 } }}
        transition={{ duration: 0.18, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformBox: "view-box", transformOrigin: "4px 18px" }}
      />
    </motion.svg>
  );
}

export function AnimatedStoreIcon({
  size = 18,
  pulse: _pulse,
  ...props
}: AnimatedIconProps) {
  return <ShoppingBasketIcon size={size} {...props} />;
}

export function AnimatedBookOpenTextIcon({
  size = 18,
  pulse: _pulse,
  ...props
}: AnimatedIconProps) {
  return <BookTextIcon size={size} {...props} />;
}

export function AnimatedShoppingBagIcon({
  size = 18,
  ...props
}: AnimatedIconProps) {
  const reducedMotion = useReducedMotion();
  const interactiveMotion = reducedMotion
    ? {}
    : { whileHover: "active", whileFocus: "active", whileTap: "active" };

  return (
    <motion.svg
      {...iconAccessibilityProps(props)}
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial="idle"
      {...interactiveMotion}
    >
      <motion.g
        variants={{
          idle: { scaleX: 1, scaleY: 1, y: 0 },
          active: {
            y: [-4, 0, 0],
            scaleY: [1, 0.86, 1.05, 1],
            scaleX: [1, 1.12, 0.98, 1],
          },
        }}
        transition={{ duration: 0.48, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformBox: "view-box", transformOrigin: "12px 22px" }}
      >
        <motion.path
          d="M16 10a4 4 0 0 1-8 0"
          variants={{
            idle: { scale: 1, opacity: 1 },
            active: { scale: [0.5, 1.15, 1], opacity: [0, 1, 1] },
          }}
          transition={{ ...iconTransition, delay: 0.1 }}
          style={{ transformBox: "view-box", transformOrigin: "12px 11px" }}
        />
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
  const iconInteraction = reducedMotion
    ? {}
    : {
        onPointerEnter: () => {
          if (canHover) setHovered(true);
        },
        onPointerLeave: () => {
          setHovered(false);
        },
        onPointerDown: () => {
          if (!canHover) playPressAnimation();
        },
        onTouchStart: () => {
          if (!canHover) playPressAnimation();
        },
        onFocus: () => {
          if (canHover) setHovered(true);
        },
        onBlur: () => {
          setHovered(false);
        },
      };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncHoverCapability = () => setCanHover(hoverQuery.matches);
    syncHoverCapability();
    hoverQuery.addEventListener("change", syncHoverCapability);
    return () => hoverQuery.removeEventListener("change", syncHoverCapability);
  }, []);

  useEffect(
    () => () => {
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
    },
    []
  );

  if (name === "Home") {
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
        <motion.path
          d="M3 10.8 12 3l9 7.8"
          initial="idle"
          animate={state}
          variants={{
            idle: { pathLength: 1, opacity: 1 },
            active: { pathLength: [0.2, 1], opacity: [0.35, 1] },
          }}
          transition={iconTransition}
        />
        <motion.path
          d="M5.5 10.5V20h13v-9.5"
          initial="idle"
          animate={state}
          variants={{
            idle: { y: 0, opacity: 1 },
            active: { y: [1.5, 0], opacity: [0.45, 1] },
          }}
          transition={{ ...iconTransition, delay: 0.08 }}
        />
        <motion.path
          d="M9.5 20v-5.5h5V20"
          initial="idle"
          animate={state}
          variants={{
            idle: { scaleY: 1, opacity: 1 },
            active: { scaleY: [0.25, 1], opacity: [0, 1] },
          }}
          transition={{ ...iconTransition, delay: 0.16 }}
          style={{ transformBox: "view-box", transformOrigin: "12px 20px" }}
        />
      </motion.svg>
    );
  }

  if (name === "Messages") {
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
        <motion.path
          d="M3.2 16.2a2 2 0 0 1 .1 1.15l-1.05 3.25a1 1 0 0 0 1.23 1.17l3.38-1a2 2 0 0 1 1.1.1 10 10 0 1 0-4.75-4.67"
          initial="idle"
          animate={state}
          variants={{
            idle: { pathLength: 1, opacity: 1 },
            active: { pathLength: [0.28, 1], opacity: [0.35, 1] },
          }}
          transition={iconTransition}
        />
        {[8, 12, 16].map((x, index) => (
          <motion.path
            key={x}
            d={`M${x} 12h.01`}
            initial="idle"
            animate={state}
            variants={{
              idle: { scale: 1, opacity: 1 },
              active: { scale: [0, 1.28, 1], opacity: [0, 1, 1] },
            }}
            transition={{ ...iconTransition, delay: 0.12 + index * 0.08 }}
            style={{ transformBox: "view-box", transformOrigin: `${x}px 12px` }}
          />
        ))}
      </motion.svg>
    );
  }

  if (name === "Shops") {
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
        {[
          "M2 11h20",
          "m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4",
          "m5 11 4-7",
          "m19 11-4-7",
          "m9 11 1 9",
          "m15 11-1 9",
          "M4.5 15.5h15",
        ].map((path, index) => (
          <motion.path
            key={path}
            d={path}
            initial="idle"
            animate={state}
            variants={{
              idle: { pathLength: 1, opacity: 1 },
              active: { pathLength: [0, 1], opacity: [0, 1] },
            }}
            transition={{
              duration: 0.5,
              delay: Math.min(index, 3) * 0.08,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
        ))}
      </motion.svg>
    );
  }

  if (name === "Learn") {
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
        <motion.g
          initial="idle"
          animate={state}
          variants={{
            idle: { scale: 1, rotate: 0, y: 0 },
            active: {
              scale: [1, 1.04, 1],
              rotate: [0, -8, 8, -8, 0],
              y: [0, -2, 0],
            },
          }}
          transition={{
            duration: 0.6,
            ease: "easeInOut",
            times: [0, 0.2, 0.5, 0.8, 1],
          }}
          style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
        >
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
        <motion.g
          initial="idle"
          animate={state}
          variants={{ idle: { scale: 1 }, active: { scale: [1, 1.03, 1] } }}
          transition={{ duration: 0.62, ease: "easeInOut" }}
          style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 3v18" />
          <path d="M17 3v18" />
          {["M3 7.5h4", "M17 7.5h4", "M3 12h18", "M3 16.5h4", "M17 16.5h4"].map(
            (path, index) => (
              <motion.path
                key={path}
                d={path}
                initial="idle"
                animate={state}
                variants={movingLineVariants}
                transition={{
                  duration: 0.72,
                  delay: index * 0.035,
                  ease: "easeInOut",
                  times: [0, 0.22, 0.45, 0.68, 1],
                }}
              />
            )
          )}
        </motion.g>
      </motion.svg>
    );
  }

  if (name === "Communities") {
    // Lucide `users` — the same set as every other glyph in this nav, so it
    // inherits their optical height instead of fighting it.
    //
    // Stock `users` is two figures: one complete person plus a partial
    // silhouette on the right. Communities reads better as a group, so that
    // right-hand silhouette is mirrored onto the left to make three.
    //
    // How the mirror was derived — reflect every X about the centre line
    // (x => 24 - x):
    //   - the right-hand arcs (X 16…22) land at X 2…8 on the left
    //   - each arc's sweep flag flips (1 -> 0). That flip is what turns a
    //     right-bulging arc into a left-bulging one; skip it and the new
    //     silhouette bulges back into the figure it is supposed to sit beside.
    //   - the full figure shifts +3 on X (`H6` -> `H9`, circle cx 9 -> 12) so
    //     it ends up centred and leaves room for the new left silhouette.
    //
    // Height is Y 3–21 = 18 user-units, the same as the Stories glyph, which is
    // why this branch needs no scale correction. The Material `MdOutlineGroups`
    // version it replaces did need one, because that glyph is 2:1 inside a
    // square viewBox. Height is the dimension that has to match the neighbours —
    // width does not, see the trade-off note on the path constants below.
    //
    // Note the +3 shift above consumes the gap lucide had between the centre
    // figure and the right one, which is why the sides then had to be pushed
    // back out. Adding a third silhouette to a two-figure design is not free.
    //
    // Side silhouettes are pushed 2.5 user-units clear of the centre figure.
    // Each is a sliver of a circle with the same radius as the centre head
    // (r=4, arcs centred at x=6.5/17.5 for the heads and x=3.5/20.5 for the
    // bodies, i.e. mirror-symmetric about x=12), so all three read as equal-size
    // people. At the previous 0 gap the strokes were merging into the centre
    // head rather than sitting beside it.
    //
    // Trade-off: the glyph is now 25 units wide (27 including stroke) against
    // 18-20 for its neighbours. That is inherent to showing three figures — if
    // it reads too wide, the fix is to narrow the centre body (H9 -> H10,
    // M19 -> M18) rather than to pull the sides back in.
    const centreBody = "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2";
    const sideHeadArc = {
      left: "M5.5 3.128a4 4 0 0 0 0 7.744",
      right: "M18.5 3.128a4 4 0 0 1 0 7.744",
    };
    const sideBodyArc = {
      left: "M-0.5 21v-2a4 4 0 0 1 3-3.87",
      right: "M24.5 21v-2a4 4 0 0 0-3-3.87",
    };

    // Measured path lengths, used as the dash arrays below. These have to match
    // the real geometry: a dash array much longer than the path leaves the
    // stroke fully drawn for most of the tween, so the figure snaps into place
    // instead of drawing in. (Head arcs are 10.54, body arcs 7.27, centre body
    // 22.57 — rounded up so the path is fully covered at offset 0.)
    const HEAD_ARC_LEN = 11;
    const BODY_ARC_LEN = 8;
    const CENTRE_BODY_LEN = 23;

    const bodyArcVariants: Variants = {
      idle: { strokeDashoffset: 0, opacity: 1 },
      active: { strokeDashoffset: [CENTRE_BODY_LEN, 0], opacity: [0.3, 1] },
    };
    const headVariants: Variants = {
      idle: { scale: 1, opacity: 1 },
      active: { scale: [0.6, 1.2, 1], opacity: [0, 1] },
    };
    // The side silhouettes draw themselves in and slide in from their own
    // edge at the same time, so they read as arriving rather than just fading.
    const leftSideVariants = (len: number): Variants => ({
      idle: { strokeDashoffset: 0, opacity: 0.8, x: 0 },
      active: { strokeDashoffset: [len, 0], opacity: [0.2, 1], x: [-3, 0] },
    });
    const rightSideVariants = (len: number): Variants => ({
      idle: { strokeDashoffset: 0, opacity: 0.8, x: 0 },
      active: { strokeDashoffset: [len, 0], opacity: [0.2, 1], x: [3, 0] },
    });

    return (
      // Timings are the source component's compressed to ~70%: this fires on
      // nav press, where a full second of animation feels sluggish.
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
        <motion.path
          d={sideBodyArc.left}
          strokeDasharray={BODY_ARC_LEN}
          initial="idle"
          animate={state}
          variants={leftSideVariants(BODY_ARC_LEN)}
          transition={{ duration: 0.5, ease: "easeInOut", delay: 0.2 }}
        />
        <motion.path
          d={sideHeadArc.left}
          strokeDasharray={HEAD_ARC_LEN}
          initial="idle"
          animate={state}
          variants={leftSideVariants(HEAD_ARC_LEN)}
          transition={{ duration: 0.5, ease: "easeInOut", delay: 0.2 }}
        />
        <motion.path
          d={centreBody}
          strokeDasharray={CENTRE_BODY_LEN}
          initial="idle"
          animate={state}
          variants={bodyArcVariants}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
        <motion.circle
          cx="12"
          cy="7"
          r="4"
          initial="idle"
          animate={state}
          variants={headVariants}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.14 }}
          style={{ transformBox: "view-box", transformOrigin: "12px 7px" }}
        />
        <motion.path
          d={sideHeadArc.right}
          strokeDasharray={HEAD_ARC_LEN}
          initial="idle"
          animate={state}
          variants={rightSideVariants(HEAD_ARC_LEN)}
          transition={{ duration: 0.5, ease: "easeInOut", delay: 0.2 }}
        />
        <motion.path
          d={sideBodyArc.right}
          strokeDasharray={BODY_ARC_LEN}
          initial="idle"
          animate={state}
          variants={rightSideVariants(BODY_ARC_LEN)}
          transition={{ duration: 0.5, ease: "easeInOut", delay: 0.2 }}
        />
      </motion.svg>
    );
  }

  if (name === "Profile") {
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
        {...iconInteraction}
      >
        <motion.path
          d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
          strokeDasharray="40"
          initial="idle"
          animate={state}
          variants={{
            idle: { strokeDashoffset: 0, opacity: 1 },
            active: { strokeDashoffset: [40, 0], opacity: [0.3, 1] },
          }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        />
        <motion.circle
          cx="12"
          cy="7"
          r="4"
          initial="idle"
          animate={state}
          variants={{
            idle: { scale: 1, opacity: 1 },
            active: { scale: [0.6, 1.2, 1], opacity: [0, 1] },
          }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
          style={{ transformBox: "view-box", transformOrigin: "12px 7px" }}
        />
      </motion.svg>
    );
  }

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
      {...iconInteraction}
    >
      <motion.g
        initial="idle"
        animate={state}
        variants={{
          idle: { scaleX: 1, scaleY: 1, y: 0 },
          active: {
            y: [-4, 0, 0],
            scaleY: [1, 0.86, 1.05, 1],
            scaleX: [1, 1.12, 0.98, 1],
          },
        }}
        transition={{ duration: 0.48, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformBox: "view-box", transformOrigin: "12px 22px" }}
      >
        <motion.path
          d="M16 10a4 4 0 0 1-8 0"
          initial="idle"
          animate={state}
          variants={{
            idle: { scale: 1, opacity: 1 },
            active: { scale: [0.5, 1.15, 1], opacity: [0, 1, 1] },
          }}
          transition={{ ...iconTransition, delay: 0.1 }}
          style={{ transformBox: "view-box", transformOrigin: "12px 11px" }}
        />
        <path d="M3.1 6.03h17.8" />
        <path d="M3.4 5.47a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.67a2 2 0 0 0-.4-1.2l-2-2.67A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" />
      </motion.g>
    </motion.svg>
  );
}
