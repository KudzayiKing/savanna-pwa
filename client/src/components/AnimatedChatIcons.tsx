import { cn } from "@/lib/utils";
import {
  LazyMotion,
  domMin,
  m,
  useAnimation,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
  type MouseEvent,
} from "react";

/**
 * Icon set for the conversation header. These mirror the Lucide video,
 * phone and ellipsis-vertical glyphs so the chat chrome stays visually
 * consistent with the rest of the app, but animate on hover (pointer
 * devices) or on demand through the imperative handle (touch devices).
 */

export interface ChatIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ChatIconProps
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

const VideoIcon = forwardRef<ChatIconHandle, ChatIconProps>(
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

    const start = useCallback(() => {
      if (reduced) return;
      controls.start("pan");
    }, [controls, reduced]);

    const stop = useCallback(() => {
      controls.start("rest");
    }, [controls]);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: start,
        stopAnimation: stop,
      };
    });

    const handleEnter = useCallback(
      (event?: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) start();
        else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
      },
      [isAnimated, onMouseEnter, reduced, start]
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          stop();
        } else {
          onMouseLeave?.(event);
        }
      },
      [onMouseLeave, stop]
    );

    const cameraVariants: Variants = {
      rest: { rotate: 0 },
      pan: {
        rotate: [0, -6, -6, 2.5, 0],
        transition: {
          duration: 0.75 * duration,
          ease: "easeInOut",
          times: [0, 0.32, 0.5, 0.8, 1],
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
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={controls}
            initial="rest"
          >
            <m.g
              variants={cameraVariants}
              style={{
                transformBox: "view-box",
                originX: "9px",
                originY: "18px",
              }}
            >
              <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
              <rect x="2" y="6" width="14" height="12" rx="2" />
            </m.g>
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

VideoIcon.displayName = "VideoIcon";

const PhoneIcon = forwardRef<ChatIconHandle, ChatIconProps>(
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

    const phoneVariants: Variants = {
      normal: { rotate: 0 },
      animate: {
        rotate: [0, -8, 8, -6, 6, 0],
        transition: {
          duration: 0.9 * duration,
          ease: "easeInOut",
        },
      },
    };

    const pulseVariants: Variants = {
      normal: { opacity: 0, scale: 0.3 },
      animate: {
        opacity: [0, 0.25, 0],
        scale: [0.3, 1.5],
        transition: {
          duration: 0.9 * duration,
          ease: "easeOut",
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
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <m.circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              variants={pulseVariants}
              initial="normal"
              animate={controls}
            />
            <m.path
              d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"
              variants={phoneVariants}
              initial="normal"
              animate={controls}
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
              }}
            />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

PhoneIcon.displayName = "PhoneIcon";

const EllipsisVerticalIcon = forwardRef<ChatIconHandle, ChatIconProps>(
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

    const dotVariants: Variants = {
      normal: { x: 0 },
      animate: (index: number) => ({
        x: [0, -3, 0],
        transition: {
          duration: 0.35 * duration,
          delay: index * 0.12,
          ease: "easeInOut",
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
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial="normal"
            animate={controls}
          >
            <m.circle cx="12" cy="5" r="1" variants={dotVariants} custom={0} />
            <m.circle cx="12" cy="12" r="1" variants={dotVariants} custom={1} />
            <m.circle cx="12" cy="19" r="1" variants={dotVariants} custom={2} />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

EllipsisVerticalIcon.displayName = "EllipsisVerticalIcon";

const MicIcon = forwardRef<ChatIconHandle, ChatIconProps>(
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

    const micVariants: Variants = {
      normal: { scale: 1, rotate: 0, y: 0 },
      animate: {
        scale: [1, 1.1, 0.95, 1],
        rotate: [0, -3, 3, -2, 2, 0],
        y: [0, -1, 0],
        transition: { duration: 1.5 * duration, repeat: 0, ease: "easeInOut" },
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
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            variants={micVariants}
            animate={controls}
            initial="normal"
          >
            <path d="M12 19v3" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <rect x="9" y="2" width="6" height="13" rx="3" />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

MicIcon.displayName = "MicIcon";

/**
 * Sticker icon - a smiley whose mouth curls from a flat line into a smile
 * when the tray opens. Runs on open via the imperative handle (matching how
 * the mic icon pulses) and on hover for pointer devices.
 */
const StickerIcon = forwardRef<ChatIconHandle, ChatIconProps>(
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

    const faceVariants: Variants = {
      normal: { scale: 1, rotate: 0 },
      animate: {
        scale: [0.6, 1.15, 1],
        rotate: [0, -8, 0],
        transition: { duration: 0.5 * duration, ease: [0.34, 1.4, 0.64, 1] },
      },
    };

    const eyesVariants: Variants = {
      normal: { opacity: 1 },
      animate: {
        opacity: [0, 1],
        transition: { duration: 0.25 * duration, delay: 0.18 * duration },
      },
    };

    const smileVariants: Variants = {
      normal: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: {
          duration: 0.35 * duration,
          delay: 0.15 * duration,
          ease: "easeOut",
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
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial="normal"
            animate={controls}
          >
            <m.circle
              cx="12"
              cy="12"
              r="10"
              variants={faceVariants}
              style={{
                transformBox: "view-box",
                originX: "12px",
                originY: "12px",
              }}
            />
            <m.path d="M15 10V9" variants={eyesVariants} />
            <m.path d="M9 10V9" variants={eyesVariants} />
            <m.path d="M16.472 15a6 6 0 0 1-8.943 0" variants={smileVariants} />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

StickerIcon.displayName = "StickerIcon";

/**
 * Keyboard icon - shown in the tray toggle while the emoji/GIF panel is open,
 * letting users flip back to the text keyboard. Keys pop in sequence.
 */
const KeyboardIcon = forwardRef<ChatIconHandle, ChatIconProps>(
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
      animate: (i: number) => ({
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: {
          duration: 0.5 * duration,
          delay: i * 0.08 * duration,
          ease: [0.16, 1, 0.3, 1],
        },
      }),
    };

    const popVariants: Variants = {
      normal: { scale: 1, opacity: 1 },
      animate: (i: number) => ({
        scale: [0, 1.2, 1],
        opacity: [0, 1, 1],
        transition: {
          duration: 0.38 * duration,
          delay: (0.45 + i * 0.08) * duration,
          times: [0, 0.6, 1],
          ease: [0.34, 1.4, 0.64, 1],
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
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial="normal"
            animate={controls}
          >
            <m.rect
              width="20"
              height="16"
              x="2"
              y="4"
              rx="2"
              custom={0}
              variants={bodyVariants}
            />
            <m.path
              d="M6 8h.01"
              custom={0}
              variants={popVariants}
              style={{
                transformBox: "view-box",
                originX: "6px",
                originY: "8px",
              }}
            />
            <m.path
              d="M10 8h.01"
              custom={1}
              variants={popVariants}
              style={{
                transformBox: "view-box",
                originX: "10px",
                originY: "8px",
              }}
            />
            <m.path
              d="M14 8h.01"
              custom={2}
              variants={popVariants}
              style={{
                transformBox: "view-box",
                originX: "14px",
                originY: "8px",
              }}
            />
            <m.path
              d="M18 8h.01"
              custom={3}
              variants={popVariants}
              style={{
                transformBox: "view-box",
                originX: "18px",
                originY: "8px",
              }}
            />
            <m.path
              d="M8 12h.01"
              custom={1}
              variants={popVariants}
              style={{
                transformBox: "view-box",
                originX: "8px",
                originY: "12px",
              }}
            />
            <m.path
              d="M12 12h.01"
              custom={2}
              variants={popVariants}
              style={{
                transformBox: "view-box",
                originX: "12px",
                originY: "12px",
              }}
            />
            <m.path
              d="M16 12h.01"
              custom={3}
              variants={popVariants}
              style={{
                transformBox: "view-box",
                originX: "16px",
                originY: "12px",
              }}
            />
            <m.path
              d="M7 16h10"
              custom={5}
              variants={popVariants}
              style={{
                transformBox: "view-box",
                originX: "12px",
                originY: "16px",
              }}
            />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

KeyboardIcon.displayName = "KeyboardIcon";

/**
 * Close icon - the two strokes draw outward from the center when shown and
 * rotate slightly on hover, matching the other composer icons.
 */
const CloseIcon = forwardRef<ChatIconHandle, ChatIconProps>(
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

    const strokeVariants: Variants = {
      normal: { pathLength: 1, opacity: 1, rotate: 0 },
      animate: (i: number) => ({
        pathLength: [0, 1],
        opacity: [0, 1],
        rotate: [i % 2 === 0 ? -90 : 90, 0],
        transition: {
          duration: 0.32 * duration,
          delay: i * 0.07 * duration,
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
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial="normal"
            animate={controls}
          >
            <m.path
              d="M18 6 6 18"
              custom={0}
              variants={strokeVariants}
              style={{
                transformBox: "view-box",
                originX: "12px",
                originY: "12px",
              }}
            />
            <m.path
              d="m6 6 12 12"
              custom={1}
              variants={strokeVariants}
              style={{
                transformBox: "view-box",
                originX: "12px",
                originY: "12px",
              }}
            />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  }
);

CloseIcon.displayName = "CloseIcon";

export {
  CloseIcon,
  EllipsisVerticalIcon,
  KeyboardIcon,
  MicIcon,
  PhoneIcon,
  StickerIcon,
  VideoIcon,
};
