import { useEffect, useState, useRef } from 'react';

// Enhanced confetti with varied shapes, sizes, and natural falling motion
const COLORS = [
  '#ff5959', // red
  '#ffbd59', // orange
  '#ffef59', // yellow
  '#c8ff58', // lime
  '#59ff6b', // green
  '#59ffd5', // cyan
  '#59dfff', // teal
  '#59b0ff', // blue
  '#af59ff', // violet
  '#ff58c4', // pink
];

const SHAPES = ['square', 'circle', 'triangle'];

// Random utility functions
const random = (min: number, max: number) => Math.random() * (max - min) + min;
const randomInt = (min: number, max: number) => Math.floor(random(min, max));

interface ConfettiPiece {
  id: string;
  x: number;
  y: number;
  xSpeed: number;
  ySpeed: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: 'square' | 'circle' | 'triangle';
  size: number;
  color: string;
  delay: number;
}

let _idCounter = 0;
const generateId = () => `confetti-${++_idCounter}`;

export default function Confetti() {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const animationFrameRef = useRef<number>();

  // Inject global keyframes once
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'confetti-keyframes';
    style.innerHTML = `
      @keyframes fade-out {
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const existing = document.getElementById('confetti-keyframes');
      if (existing) existing.remove();
    };
  }, []);

  useEffect(() => {
    // Create initial burst
    const createBurst = (count: number) => {
      const newPieces: ConfettiPiece[] = [];
      for (let i = 0; i < count; i++) {
        newPieces.push(createPiece());
      }
      setPieces(prev => [...prev, ...newPieces]);
    };

    createBurst(80); // Initial burst

    // Continuous spawning
    const spawnInterval = setInterval(() => {
      createBurst(20);
    }, 500);

    // Animation loop
        const animate = () => {
          setPieces(prev => {
            return prev
              .map(piece => {
                // Apply physics
                const updated = { ...piece };
                updated.x += updated.xSpeed;
                updated.y += updated.ySpeed;
                updated.ySpeed += 0.25; // gravity
                updated.rotation += updated.rotationSpeed;
                updated.opacity = Math.max(0, 1 - (updated.y / window.innerHeight));
            
                // Remove if off screen
                if (
                  updated.y > window.innerHeight + 100 ||
                  updated.x < -100 ||
                  updated.x > window.innerWidth + 100
                ) {
                  return null;
                }
                return updated;
              })
              .filter((p): p is ConfettiPiece => p !== null);
          });

          animationFrameRef.current = requestAnimationFrame(animate);
        };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      clearInterval(spawnInterval);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const createPiece = (): ConfettiPiece => {
    const size = random(4, 12);
    const shape = SHAPES[randomInt(0, SHAPES.length)];
    return {
      id: generateId(),
      x: random(0, window.innerWidth),
      y: random(-100, -20),
      xSpeed: random(-2, 2),
      ySpeed: random(1, 3),
      rotation: random(0, 360),
      rotationSpeed: random(-5, 5),
      opacity: 1,
      shape,
      size,
      color: COLORS[randomInt(0, COLORS.length)],
      delay: 0,
    };
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden pointer-events-none">
      {pieces.map(piece => {
        const transform = `translate(${piece.x}px, ${piece.y}px) rotate(${piece.rotation}deg)`;
        let shapeElement: JSX.Element;
        
        switch (piece.shape) {
          case 'circle':
            shapeElement = <div className="confetti-circle" />;
            break;
          case 'triangle':
            shapeElement = <div className="confetti-triangle" />;
            break;
          default: // square
            shapeElement = <div className="confetti-square" />;
        }
        
        return (
          <div
            key={piece.id}
            className="confetti-piece"
            style={{
              position: 'absolute',
              width: `${piece.size}px`,
              height: `${piece.size}px`,
              backgroundColor: piece.color,
              opacity: piece.opacity,
              transform,
              filter: `drop-shadow(0 0 1px rgba(255,255,255,0.3))`,
              animation: 'fade-out 2s ease-out forwards',
              animationDelay: `${piece.delay}s`,
              pointerEvents: 'none',
            }}
          >
            {shapeElement}
          </div>
        );
      })}
      
      {/* Styles for different shapes */}
      <style>
        {`
          .confetti-square { width: 100%; height: 100%; }
          .confetti-circle { 
            width: 100%; height: 100%; 
            border-radius: 50%; 
          }
          .confetti-triangle {
            width: 0; 
            height: 0;
            border-left: 50% solid transparent;
            border-right: 50% solid transparent;
            border-bottom: 100% solid;
            transform-origin: bottom center;
          }
        `}
      </style>
    </div>
  );
}