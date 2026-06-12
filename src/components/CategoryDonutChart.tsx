import React from 'react';
import { buildDonutSegments, type DonutSegment } from '../core/personal/categories';

interface CategoryDonutChartProps {
  title: string;
  centerLabel: string;
  categoryData: Record<string, number>;
  emptyMessage: string;
  emptyHint?: string;
}

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  title,
  centerLabel,
  categoryData,
  emptyMessage,
  emptyHint
}) => {
  const totalAmount = Object.values(categoryData).reduce((acc, value) => acc + value, 0);
  const donutSegments: DonutSegment[] = buildDonutSegments(categoryData);

  return (
    <>
      <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>{title}</h2>

      {totalAmount === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
          <p>{emptyMessage}</p>
          {emptyHint && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{emptyHint}</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-around', gap: '24px' }}>
          <div style={{ position: 'relative', width: '200px', height: '200px' }}>
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="80" fill="none" stroke="var(--bg-surface)" strokeWidth="24" />
              {donutSegments.map((segment, index) => {
                const radius = 70;
                const circumference = 2 * Math.PI * radius;
                const strokeDasharray = `${(segment.pct * circumference).toFixed(2)} ${circumference}`;
                const strokeDashoffset = `${(-(segment.startAngle / 360) * circumference).toFixed(2)}`;

                return (
                  <circle
                    key={index}
                    cx="100"
                    cy="100"
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="20"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    transform="rotate(-90 100 100)"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                  />
                );
              })}
            </svg>
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                width: '100px'
              }}
            >
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>{centerLabel}</p>
              <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                ${totalAmount.toFixed(0)}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '180px' }}>
            {donutSegments.map((segment, index) => (
              <div
                key={index}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: segment.color,
                      display: 'inline-block'
                    }}
                  />
                  <span style={{ color: 'var(--text-secondary)' }}>{segment.cat}</span>
                </div>
                <span style={{ fontWeight: 600 }}>
                  ${segment.val.toFixed(2)} ({(segment.pct * 100).toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
