import { CSSProperties, FC } from 'react';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
}

export const ShinyText: FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 3,
  className = '',
}) => {
  const animationDuration = `${speed}s`;

  return (
    <div
      className={`relative inline-block overflow-hidden ${
        disabled ? '' : 'animate-shine'
      } ${className}`}
      style={
        {
          backgroundImage:
            'linear-gradient(120deg, rgba(255, 255, 255, 0) 40%, rgba(255, 255, 255, 0.8) 50%, rgba(255, 255, 255, 0) 60%)',
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          animationDuration: animationDuration,
          '--shine-angle': '120deg',
        } as CSSProperties
      }
    >
      {text}
    </div>
  );
};
