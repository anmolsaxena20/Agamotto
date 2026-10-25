import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { Share2, RefreshCw, Server, Database, ArrowRight } from 'lucide-react';

export function DependencyGraphView({ onSelectService }) {
  const { currentOrg } = useOrg();
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGraph = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const res = await analyticsService.getDependencyGraph(currentOrg.id);
      setGraphData(res);
    } catch (err) {
      console.warn('Failed to load dependency graph:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, [currentOrg?.id]);

  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Service Dependency Graph</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Interactive topology map of microservice calls, edge latency p99, and database dependencies.
          </p>
        </div>

        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchGraph} isLoading={isLoading}>
          Refresh
        </Button>
      </div>

      {/* SVG Canvas Card */}
      {nodes.length === 0 ? (
        <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Share2 size={36} style={{ color: 'var(--text-dim)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
            No Service Topology Detected
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
            Distributed call relationships, network hops, and database queries will automatically construct your topology map as traces flow in.
          </p>
        </Card>
      ) : (
        <Card style={{ padding: '24px', overflowX: 'auto' }}>
          <div style={{ minWidth: '800px', position: 'relative' }}>
          <svg width="100%" height="340" viewBox="0 0 820 340" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--border)" />
                <stop offset="100%" stopColor="var(--accent)" />
              </linearGradient>
            </defs>

            {/* Connecting Edges */}
            {edges.map((edge, idx) => {
              const srcNode = nodes.find((n) => n.id === edge.source) || { x: 100, y: 100 };
              const tgtNode = nodes.find((n) => n.id === edge.target) || { x: 200, y: 200 };
              const midX = (srcNode.x + tgtNode.x) / 2;
              const midY = (srcNode.y + tgtNode.y) / 2;

              return (
                <g key={idx}>
                  <line
                    x1={srcNode.x + 60}
                    y1={srcNode.y + 20}
                    x2={tgtNode.x - 10}
                    y2={tgtNode.y + 20}
                    stroke={edge.errorCount > 0 ? 'var(--warn)' : 'var(--border)'}
                    strokeWidth="2"
                    strokeDasharray={edge.errorCount > 0 ? '4 4' : 'none'}
                  />
                  {/* Latency Pill */}
                  <rect
                    x={midX + 10}
                    y={midY + 10}
                    width="60"
                    height="18"
                    rx="9"
                    fill="var(--surface-input)"
                    stroke="var(--border)"
                  />
                  <text
                    x={midX + 40}
                    y={midY + 23}
                    fill="var(--accent)"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {edge.p99}ms
                  </text>
                </g>
              );
            })}

            {/* Service & Database Nodes */}
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const isWarn = node.status === 'warn';

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x - 20}, ${node.y - 10})`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedNode(node);
                    if (node.type === 'service') {
                      onSelectService?.(node.id);
                    }
                  }}
                >
                  <rect
                    width="140"
                    height="56"
                    rx="8"
                    fill={isSelected ? 'var(--accent-subtle)' : 'var(--surface-subtle)'}
                    stroke={isWarn ? 'var(--warn)' : isSelected ? 'var(--accent)' : 'var(--border)'}
                    strokeWidth={isSelected ? '2' : '1'}
                    filter="drop-shadow(0 4px 12px rgba(0,0,0,0.3))"
                  />
                  <text
                    x="16"
                    y="24"
                    fill="var(--text)"
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="var(--font-sans)"
                  >
                    {node.name}
                  </text>
                  <text
                    x="16"
                    y="42"
                    fill="var(--text-muted)"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                  >
                    {node.type === 'database' ? 'Columnar OLAP' : `${node.rps || 120} RPS`}
                  </text>
                  <circle
                    cx="124"
                    cy="20"
                    r="4"
                    fill={isWarn ? 'var(--warn)' : 'var(--ok)'}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </Card>
      )}

      {/* Selected Node Inspector */}
      {selectedNode && (
        <Card style={{ backgroundColor: 'var(--surface-input)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Selected Topology Entity
              </div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>
                {selectedNode.name} ({selectedNode.id})
              </div>
            </div>

            <StatusBadge
              status={selectedNode.status === 'warn' ? 'warn' : 'ok'}
              label={selectedNode.status === 'warn' ? 'Investigation Recommended' : 'Optimal'}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
