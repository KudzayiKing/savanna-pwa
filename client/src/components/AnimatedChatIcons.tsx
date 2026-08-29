import { cn } from "@/lib/utils";
import { LazyMotion, domMin, m, useAnimation, useReducedMotion, type Variants } from "framer-motion";
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

interface ChatIconProps extends Omit<
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
    ref,
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
      [isAnimated, onMouseEnter, reduced, start],
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          stop();
        } else {
          onMouseLeave?.(event);
        }
      },
      [onMouseLeave, stop],
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
  },
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
    ref,
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => (reduced ? controls.start("normal") : controls.start("animate")),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback(
      (event?: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) controls.start("animate");
        else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
      },
      [controls, isAnimated, onMouseEnter, reduced],
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          controls.start("normal");
        } else {
          onMouseLeave?.(event);
        }
      },
      [controls, onMouseLeave],
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
  },
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
    ref,
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => (reduced ? controls.start("normal") : controls.start("animate")),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback(
      (event?: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) controls.start("animate");
        else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
      },
      [controls, isAnimated, onMouseEnter, reduced],
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          controls.start("normal");
        } else {
          onMouseLeave?.(event);
        }
      },
      [controls, onMouseLeave],
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
  },
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
    ref,
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => (reduced ? controls.start("normal") : controls.start("animate")),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleEnter = useCallback(
      (event?: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) controls.start("animate");
        else onMouseEnter?.(event as MouseEvent<HTMLDivElement>);
      },
      [controls, isAnimated, onMouseEnter, reduced],
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          controls.start("normal");
        } else {
          onMouseLeave?.(event);
        }
      },
      [controls, onMouseLeave],
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
  },
);

MicIcon.displayName = "MicIcon";

export { EllipsisVerticalIcon, MicIcon, PhoneIcon, VideoIcon };
