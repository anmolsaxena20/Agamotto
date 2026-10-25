import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { formatLatency } from '../../utils/formatters.js';
import { Share2, RefreshCw, Server, Database, ArrowRight } from 'lucide-react';

export function DependencyGraphView({ onSelectService }) {
  const { currentOrg } = useOrg();
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGraph = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const res = await analyticsService.getDependencyGraph(currentOrg.id);
      const rawEdges = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : (res?.edges || []));

      // Construct distinct nodes and calculate layout
      const nodeMap = new Map();
      const cleanEdges = [];

      rawEdges.forEach((e) => {
        const src = e.source || 'unknown-source';
        const tgt = e.target || 'unknown-target';
        const calls = Number(e.calls || e.count || 1);
        const p99 = e.p99_ms != null ? Number(e.p99_ms) : (e.p99 != null ? Number(e.p99) : 0);
        const errorCount = Number(e.error_count || e.errors || 0);

        if (!nodeMap.has(src)) {
          nodeMap.set(src, { id: src, name: src, type: 'service', calls: 0, errors: 0 });
        }
        if (!nodeMap.has(tgt)) {
          nodeMap.set(tgt, { id: tgt, name: tgt, type: tgt.includes('db') ? 'database' : 'service', calls: 0, errors: 0 });
        }

        const srcNode = nodeMap.get(src);
        srcNode.calls += calls;
        srcNode.errors += errorCount;

        const tgtNode = nodeMap.get(tgt);
        tgtNode.calls += calls;

        cleanEdges.push({
          source: src,
          target: tgt,
          calls,
          p99,
          errorCount,
        });
      });

      // Position nodes in a 2D topology ring/grid layout
      const nodeList = Array.from(nodeMap.values());
      const total = nodeList.length;
      nodeList.forEach((n, idx) => {
        if (total === 1) {
          n.x = 340;
          n.y = 140;
        } else if (total === 2) {
          n.x = idx === 0 ? 180 : 520;
          n.y = 140;
        } else {
          const angle = (idx / total) * 2 * Math.PI;
          n.x = Math.round(380 + Math.cos(angle) * 260);
          n.y = Math.round(160 + Math.sin(angle) * 100);
        }
        n.status = n.errors > 0 ? 'warn' : 'ok';
      });

      setGraphData({ nodes: nodeList, edges: cleanEdges });
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
            {isLoading
              ? 'Computing topology relationships across trace parent-child spans...'
              : 'Distributed call relationships and network hops will automatically sketch your topology map as spans flow in.'}
          </p>
        </Card>
      ) : (
        <Card style={{ padding: '24px', overflowX: 'auto' }}>
          <div style={{ minWidth: '820px', position: 'relative' }}>
            <svg width="100%" height="360" viewBox="0 0 840 360" style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--border)" />
                  <stop offset="100%" stopColor="var(--accent)" />
                </linearGradient>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted)" />
                </marker>
              </defs>

              {/* Connecting Edges */}
              {edges.map((edge, idx) => {
                const srcNode = nodes.find((n) => n.id === edge.source) || { x: 180, y: 140 };
                const tgtNode = nodes.find((n) => n.id === edge.target) || { x: 520, y: 140 };
                const midX = (srcNode.x + tgtNode.x) / 2;
                const midY = (srcNode.y + tgtNode.y) / 2;

                return (
                  <g key={idx}>
                    <line
                      x1={srcNode.x + 70}
                      y1={srcNode.y + 28}
                      x2={tgtNode.x}
                      y2={tgtNode.y + 28}
                      stroke={edge.errorCount > 0 ? 'var(--warn)' : 'var(--border)'}
                      strokeWidth="2"
                      strokeDasharray={edge.errorCount > 0 ? '4 4' : 'none'}
                      markerEnd="url(#arrow)"
                    />
                    {/* Latency Pill */}
                    <rect
                      x={midX - 10}
                      y={midY + 12}
                      width="80"
                      height="20"
                      rx="10"
                      fill="var(--surface-input)"
                      stroke="var(--border)"
                    />
                    <text
                      x={midX + 30}
                      y={midY + 26}
                      fill="var(--accent)"
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                      fontWeight="600"
                    >
                      {formatLatency(edge.p99)}
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
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedNode(node);
                      if (node.type === 'service') {
                        onSelectService?.(node.id);
                      }
                    }}
                  >
                    <rect
                      width="150"
                      height="56"
                      rx="8"
                      fill={isSelected ? 'var(--accent-subtle)' : 'var(--surface-input)'}
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
                      {node.calls ? `${Number(node.calls).toLocaleString()} calls` : 'Active Entity'}
                    </text>
                    <circle
                      cx="134"
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
                {selectedNode.name}
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
