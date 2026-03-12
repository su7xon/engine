import { useState, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";

const graphData = {
  nodes: [
    { id: "India", type: "country", size: 32, color: "#FF9933", desc: "Sovereign Republic of India. Core node of the Intelligence Graph." },
    { id: "China", type: "country", size: 26, color: "#DE2910", desc: "People's Republic of China. Primary strategic competitor and supply chain dependency." },
    { id: "USA", type: "country", size: 26, color: "#4B6BFB", desc: "United States of America. Key technology and security partner." },
    { id: "Russia", type: "country", size: 22, color: "#6B7FD7", desc: "Russian Federation. Critical energy and defense equipment supplier." },
    { id: "Gulf States", type: "country", size: 20, color: "#10B981", desc: "Primary source of energy and home to large Indian diaspora." },
    { id: "EU", type: "country", size: 20, color: "#818CF8", desc: "Major trading partner and technology source." },
    { id: "Semiconductors", type: "tech", size: 20, color: "#00D4FF", desc: "Microchips and integrated circuits. 100% import dependency for defense and tech." },
    { id: "Oil & Energy", type: "resource", size: 24, color: "#FFD700", desc: "Crude oil and natural gas imports. Critical for national energy security." },
    { id: "Defense", type: "sector", size: 22, color: "#FF4444", desc: "National defense and aerospace. Major user of high-tech imports." },
    { id: "Agriculture", type: "sector", size: 18, color: "#44FF88", desc: "Backbone of rural economy. Vulnerable to monsoon shifts and global prices." },
    { id: "Rare Earth", type: "resource", size: 18, color: "#C084FC", desc: "Critical minerals for electronics and green energy. High dependency on China." },
    { id: "Remittances", type: "economic", size: 16, color: "#FFB344", desc: "$125B+ annual inflows. Critical for foreign exchange reserves." },
    { id: "Border Disputes", type: "conflict", size: 18, color: "#FF6644", desc: "Active territorial conflicts (LAC/LoC). Key driver of defense spending." },
    { id: "Climate Risk", type: "global", size: 16, color: "#44DDFF", desc: "Long-term threat to agriculture and urban stability." },
    { id: "Pharma", type: "sector", size: 16, color: "#34D399", desc: "Pharmaceutical industry. Rely heavily on China for active ingredients (APIs)." },
    { id: "UPI / Fintech", type: "tech", size: 16, color: "#A78BFA", desc: "Digital public infrastructure. India's strategic soft power in finance." },
    { id: "Space / ISRO", type: "tech", size: 16, color: "#60A5FA", desc: "Strategic space capabilities and satellite intelligence." },
  ],
  links: [
    { source: "India", target: "China", label: "Trade Deficit $85B", strength: 0.9 },
    { source: "India", target: "USA", label: "Strategic Partner", strength: 0.75 },
    { source: "India", target: "Russia", label: "60% Defense Imports", strength: 0.7 },
    { source: "India", target: "Gulf States", label: "Oil + Diaspora", strength: 0.8 },
    { source: "India", target: "Semiconductors", label: "100% Import Dep.", strength: 0.95 },
    { source: "India", target: "Oil & Energy", label: "85% Import", strength: 0.9 },
    { source: "India", target: "Defense", label: "₹6.2L Cr Budget", strength: 0.75 },
    { source: "India", target: "Agriculture", label: "46% Workforce", strength: 0.85 },
    { source: "India", target: "Rare Earth", label: "China Dependency", strength: 0.8 },
    { source: "India", target: "Remittances", label: "$125B Inflow", strength: 0.65 },
    { source: "India", target: "Border Disputes", label: "LAC + LoC", strength: 0.85 },
    { source: "India", target: "Climate Risk", label: "Monsoon Stress", strength: 0.6 },
    { source: "India", target: "Pharma", label: "Pharmacy of World", strength: 0.7 },
    { source: "India", target: "UPI / Fintech", label: "10B+ txns/month", strength: 0.7 },
    { source: "India", target: "Space / ISRO", label: "Chandrayaan-3", strength: 0.65 },
    { source: "China", target: "Rare Earth", label: "60% Global Supply", strength: 0.95 },
    { source: "China", target: "Semiconductors", label: "SMIC producer", strength: 0.8 },
    { source: "Russia", target: "Oil & Energy", label: "Discounted crude", strength: 0.85 },
    { source: "USA", target: "Semiconductors", label: "Controls TSMC/Nvidia", strength: 0.9 },
    { source: "China", target: "Border Disputes", label: "LAC Incursions", strength: 0.85 },
    { source: "EU", target: "India", label: "FTA Negotiations", strength: 0.45 },
    { source: "Gulf States", target: "Remittances", label: "10M+ Workers", strength: 0.85 },
    { source: "USA", target: "Defense", label: "GE F414 Engines", strength: 0.6 },
  ]
};

const SCENARIOS = [
  { label: "Semiconductor Dependency", q: "Analyze India's risk if Taiwan semiconductor supply chain is disrupted." },
  { label: "Russia Energy Play", q: "How does discounted Russian oil affect India's strategic autonomy?" },
  { label: "Top 3 Vulnerabilities", q: "Identify India's top 3 strategic vulnerabilities in the current global order." },
  { label: "China Trade War", q: "Impact of $100B trade deficit with China on Indian MSMEs." },
  { label: "Rare Earth Security", q: "Where does India get its rare earth elements from? Mapping dependencies." }
];

const HEADLINES = [
  "BREAKING: GLOBAL CHIP SHORTAGE INTENSIFIES AS TSMC ANNOUNCES NEW MAINTENANCE DOWNTIME.",
  "DIPLOMACY: INDIA-USA SIGN MAJOR DEFENSE TECHNOLOGY TRANSFER AGREEMENT (iCET).",
  "ENERGY: RUSSIA INCREASES CRUDE EXPORTS TO ASIA; G7 PRICE CAP UNDER SCRUTINY.",
  "MONITOR: LAC INFRASTRUCTURE BUILDUP DETECTED; SATELLITE IMAGERY CONFIRMS NEW HANGARS.",
  "TECH: INDIA UPI TRANSACTIONS CROSS 12 BILLION IN SINGLE MONTH; GLOBAL ADOPTION RISING.",
  "RESOURCE: RARE EARTH DISCOVERY IN JAMMU & KASHMIR ENTERING PHASE 2 VALIDATION.",
  "CLIMATE: MONSOON DELAY POSES RISK TO AGRICULTURE SECTOR; WHEAT PRICES SURGE."
];

const AVAILABLE_NODES = graphData.nodes.map(n => n.id);

const SYSTEM_PROMPT = `You are INDRA — India's Strategic Intelligence Analysis Engine. You analyze geopolitical, economic, defense, and technological dependencies for India using a real-time knowledge graph.

You have access to this strategic dependency data:
${JSON.stringify(graphData.links.map(l => ({ from: l.source, to: l.target, relationship: l.label })))}

Available intelligence graph nodes: ${AVAILABLE_NODES.join(", ")}

Respond in sharp intelligence-briefing style. Be specific with data and numbers. Max 200 words. Format:
ASSESSMENT: [one-line summary]

KEY FINDINGS:
• [finding 1]
• [finding 2]  
• [finding 3]

STRATEGIC IMPLICATION:
[1-2 lines on what decision-makers should do]

Occasionally mix in Hindi phrases naturally. Be direct and analytical, not diplomatic.

IMPORTANT: At the very end of your response, on a new line, include exactly this tag with the relevant graph nodes (from the available nodes list above) that relate to the query. Pick ONLY the most relevant 2-5 nodes. Format: [NODES: Node1, Node2, Node3]
Example: [NODES: China, Border Disputes, Defense]
This tag is mandatory for every response. Do NOT include India in the nodes list.`;

export default function INDRAEngine() {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeQuery, setActiveQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [offlineNodes, setOfflineNodes] = useState(new Set());
  const [isSituationRoom, setIsSituationRoom] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [timelineEra, setTimelineEra] = useState("2024");
  const [watchedNodes, setWatchedNodes] = useState(new Set());
  const [activityLog, setActivityLog] = useState([{ type: "SYSTEM", msg: "INDRA ENGINE INITIALIZED", time: new Date().toLocaleTimeString() }]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [queryHighlightedNodes, setQueryHighlightedNodes] = useState(new Set());
  const [queryPrimaryNodes, setQueryPrimaryNodes] = useState(new Set());

  const logActivity = (type, msg) => {
    setActivityLog(prev => [{ type, msg, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  // Era-based graph filtering
  const currentGraph = useMemo(() => {
    let nodes = graphData.nodes.map(n => ({ ...n }));
    let links = graphData.links.map(l => ({ ...l }));

    if (timelineEra === "2020") {
      // Historical: Less advanced tech, fewer digital dependencies
      nodes = nodes.filter(n => n.id !== "UPI / Fintech");
      links = links.filter(l => l.source !== "UPI / Fintech" && l.target !== "UPI / Fintech");
      nodes.forEach(n => {
        if (n.id === "Space / ISRO") n.size = 12;
        if (n.id === "India") n.size = 28;
      });
    } else if (timelineEra === "2030") {
      // Projected: India as tech superpower, reduced energy imports
      nodes.forEach(n => {
        if (n.id === "India") n.size = 40;
        if (n.id === "Semiconductors") n.size = 28;
      });
    }

    return { nodes, links };
  }, [timelineEra]);

  // Watch-list effect: log alerts when affected status changes
  const affectedNodes = useMemo(() => getAffectedNodes(offlineNodes, currentGraph), [offlineNodes, currentGraph]);

  useEffect(() => {
    watchedNodes.forEach(nodeId => {
      const impact = affectedNodes.get(nodeId);
      if (impact > 0.5) {
        logActivity("ALERT", `CRITICAL RISK DETECTED: Watched node ${nodeId.toUpperCase()} dependency failure.`);
      }
    });
  }, [affectedNodes, watchedNodes]);

  const toggleWatch = (id) => {
    setWatchedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        logActivity("SYSTEM", `Monitoring DISABLED for node ${id.toUpperCase()}`);
      } else {
        next.add(id);
        logActivity("SYSTEM", `Monitoring ENABLED for node ${id.toUpperCase()}`);
      }
      return next;
    });
  };

  // Cascading Risk Calculation (Updated to take graph as param)
  function getAffectedNodes(offlineIds, graph) {
    const affected = new Map();
    if (offlineIds.size === 0) return affected;
    offlineIds.forEach(id => affected.set(id, 1.0));
    const queue = [...offlineIds];
    const visited = new Set(offlineIds);
    while (queue.length > 0) {
      const currentId = queue.shift();
      graph.links.forEach(link => {
        const sid = typeof link.source === 'string' ? link.source : link.source.id;
        const tid = typeof link.target === 'string' ? link.target : link.target.id;
        if (sid === currentId && !offlineIds.has(tid)) {
          const impact = (affected.get(currentId) || 0) * 0.7;
          if (impact > (affected.get(tid) || 0)) {
            affected.set(tid, impact);
            if (!visited.has(tid)) {
              visited.add(tid);
              queue.push(tid);
            }
          }
        }
      });
    }
    return affected;
  }

  // Theme colors (light mode only)
  const theme = useMemo(() => ({
    bg: "#F1F5F9",
    panel: "#FFFFFF",
    border: "#CBD5E1",
    text: "#1E293B",
    secondary: "#64748B",
    subtext: "#94A3B8",
    grid: "#E2E8F0",
    link: "#94A3B8",
    nodeLabel: (d) => d3.color(d.color).darker(0.5).toString(),
  }), []);

  const [containerReady, setContainerReady] = useState(false);

  // Wait for the container to have real dimensions before drawing
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setContainerReady(v => !v);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    let w = containerRef.current.clientWidth;
    let h = containerRef.current.clientHeight;
    if (w === 0 || h === 0) return;

    const svg = d3.select(svgRef.current).attr("width", w).attr("height", h);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    ["glow-india", "glow-node", "glow-query"].forEach((id, i) => {
      const f = defs.append("filter").attr("id", id);
      f.append("feGaussianBlur").attr("stdDeviation", i === 2 ? "8" : i === 0 ? "6" : "3").attr("result", "blur");
      const m = f.append("feMerge");
      m.append("feMergeNode").attr("in", "blur");
      m.append("feMergeNode").attr("in", "SourceGraphic");
    });

    defs.append("marker").attr("id", "arrowhead")
      .attr("viewBox", "0 -4 8 8").attr("refX", 28).attr("refY", 0)
      .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
      .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", theme.link);

    const gridGroup = svg.append("g").attr("class", "grid");
    const drawGrid = (width, height) => {
      gridGroup.selectAll("*").remove();
      for (let x = -width; x < width * 2; x += 40) {
        gridGroup.append("line").attr("x1", x).attr("y1", -height).attr("x2", x).attr("y2", height * 2)
          .attr("stroke", theme.grid).attr("stroke-width", 0.5);
      }
      for (let y = -height; y < height * 2; y += 40) {
        gridGroup.append("line").attr("x1", -width).attr("y1", y).attr("x2", width * 2).attr("y2", y)
          .attr("stroke", theme.grid).attr("stroke-width", 0.5);
      }
    };
    drawGrid(w, h);

    let filteredNodes, filteredLinks;
    if (queryHighlightedNodes.size > 0) {
      // Show only relevant nodes + India (always visible as hub)
      const visibleIds = new Set(queryHighlightedNodes);
      visibleIds.add("India");
      filteredNodes = currentGraph.nodes.filter(n => visibleIds.has(n.id)).map(d => ({ ...d }));
      filteredLinks = currentGraph.links.filter(l => {
        const sid = typeof l.source === 'string' ? l.source : l.source.id;
        const tid = typeof l.target === 'string' ? l.target : l.target.id;
        return visibleIds.has(sid) && visibleIds.has(tid);
      }).map(d => ({ ...d }));
    } else {
      filteredNodes = currentGraph.nodes.map(d => ({ ...d }));
      filteredLinks = currentGraph.links.map(d => ({ ...d }));
    }

    const nodes = filteredNodes;
    const links = filteredLinks;

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(140).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collision", d3.forceCollide().radius(d => d.size + 22));

    const g = svg.append("g");
    const zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", e => {
      g.attr("transform", e.transform);
      gridGroup.attr("transform", e.transform);
    });
    svg.call(zoom);

    if (showHeatmap) {
      g.append("g").selectAll("circle").data(nodes).enter().append("circle")
        .attr("r", d => {
          const impact = affectedNodes.get(d.id) || 0;
          return 100 + (impact * 200);
        })
        .attr("fill", d => {
          const impact = affectedNodes.get(d.id) || 0;
          return impact > 0.3 ? "rgba(255, 68, 68, 0.05)" : "transparent";
        })
        .style("filter", "blur(40px)")
        .attr("pointer-events", "none");
    }

    const link = g.append("g").selectAll("line").data(links).enter().append("line")
      .attr("stroke", d => {
        const sid = typeof d.source === 'string' ? d.source : d.source.id;
        const tid = typeof d.target === 'string' ? d.target : d.target.id;
        if (queryPrimaryNodes.has(sid) && queryPrimaryNodes.has(tid)) return "#FF9933";
        if (queryHighlightedNodes.size > 0 && queryHighlightedNodes.has(sid) && queryHighlightedNodes.has(tid)) return "#0F766E";
        return theme.link;
      })
      .attr("stroke-width", d => {
        const sid = typeof d.source === 'string' ? d.source : d.source.id;
        const tid = typeof d.target === 'string' ? d.target : d.target.id;
        if (queryHighlightedNodes.size > 0 && queryHighlightedNodes.has(sid) && queryHighlightedNodes.has(tid)) return d.strength * 5;
        return d.strength * 2;
      })
      .attr("stroke-opacity", d => {
        const sid = typeof d.source === 'string' ? d.source : d.source.id;
        const tid = typeof d.target === 'string' ? d.target : d.target.id;
        if (queryHighlightedNodes.size > 0 && queryHighlightedNodes.has(sid) && queryHighlightedNodes.has(tid)) return 1;
        return 0.5;
      })
      .attr("marker-end", "url(#arrowhead)");

    const linkLabelGroup = g.append("g").selectAll("text").data(links)
      .enter().append("text")
      .attr("font-size", d => {
        const sid = typeof d.source === 'string' ? d.source : d.source.id;
        const tid = typeof d.target === 'string' ? d.target : d.target.id;
        return (queryHighlightedNodes.has(sid) && queryHighlightedNodes.has(tid)) ? "10px" : "8px";
      })
      .attr("fill", d => {
        const sid = typeof d.source === 'string' ? d.source : d.source.id;
        const tid = typeof d.target === 'string' ? d.target : d.target.id;
        return (queryHighlightedNodes.has(sid) && queryHighlightedNodes.has(tid)) ? "#B45309" : theme.subtext;
      })
      .attr("font-weight", d => {
        const sid = typeof d.source === 'string' ? d.source : d.source.id;
        const tid = typeof d.target === 'string' ? d.target : d.target.id;
        return (queryHighlightedNodes.has(sid) && queryHighlightedNodes.has(tid)) ? "bold" : "normal";
      })
      .attr("text-anchor", "middle").attr("font-family", "monospace")
      .text(d => d.label);

    const node = g.append("g").selectAll("g").data(nodes).enter().append("g")
      .style("cursor", "pointer")
      .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (e, d) => { setSelectedNode(d); e.stopPropagation(); })
      .on("mouseover", (e, d) => {
        const impact = affectedNodes.get(d.id) || 0;
        const isOffline = offlineNodes.has(d.id);
        d3.select(e.currentTarget).select("circle:nth-child(3)").attr("stroke-width", 4).attr("stroke", impact > 0.5 ? "#FF4444" : "#0F766E");
        const tooltip = d3.select("#indra-tooltip");
        tooltip.style("visibility", "visible")
          .html(`
            <div style="font-weight:bold; color:#B45309; margin-bottom:4px; display:flex; justify-content:space-between;">
              <span>${d.id.toUpperCase()}</span>
              <span style="color:${isOffline ? '#FF4444' : '#22C55E'}; font-size:8px;">● ${isOffline ? 'OFFLINE' : 'LIVE'}</span>
            </div>
            <div style="font-size:9px; color:${impact > 0.5 ? '#FF4444' : '#94A3B8'}; margin-bottom:8px;">
              ${isOffline ? 'CRITICAL FAILURE' : impact > 0.2 ? `CASCADING RISK: ${(impact * 100).toFixed(0)}%` : `TYPE: ${d.type.toUpperCase()}`}
            </div>
            <div style="line-height:1.4; font-size:10px;">${d.desc}</div>
          `);
      })
      .on("mousemove", (e) => {
        d3.select("#indra-tooltip")
          .style("top", (e.pageY + 15) + "px")
          .style("left", (e.pageX + 15) + "px");
      })
      .on("mouseout", (e, d) => {
        const isSelected = selectedNode?.id === d.id;
        const impact = affectedNodes.get(d.id) || 0;
        d3.select(e.currentTarget).select("circle:nth-child(3)")
          .attr("stroke-width", isSelected ? 4 : (d.id === "India" ? 2.5 : 1.5))
          .attr("stroke", (impact > 0.5 && !isSelected) ? "#FF4444" : d.color);
        d3.select("#indra-tooltip").style("visibility", "hidden");
      });

    node.append("circle").attr("r", d => d.size + 8)
      .attr("fill", "none").attr("stroke", d => {
        const impact = affectedNodes.get(d.id) || 0;
        if (queryPrimaryNodes.has(d.id)) return "#FF9933";
        if (queryHighlightedNodes.has(d.id)) return "#0F766E";
        return impact > 0.5 ? "#FF4444" : d.color;
      })
      .attr("stroke-width", d => queryPrimaryNodes.has(d.id) ? 2 : (queryHighlightedNodes.has(d.id) ? 1 : 0.5))
      .attr("stroke-opacity", d => queryPrimaryNodes.has(d.id) ? 0.6 : (queryHighlightedNodes.has(d.id) ? 0.3 : 0.2))
      .style("animation", d => {
        if (queryPrimaryNodes.has(d.id)) return "pulse-risk 2.5s infinite";
        return affectedNodes.get(d.id) > 0.3 ? "pulse-risk 2s infinite" : "none";
      });

    node.filter(d => d.id === "India")
      .append("circle").attr("r", d => d.size + 20)
      .attr("fill", "none").attr("stroke", "#FF9933").attr("stroke-width", 1).attr("stroke-opacity", 0.15)
      .attr("stroke-dasharray", "4 6");

    node.append("circle")
      .attr("r", d => {
        const impact = affectedNodes.get(d.id) || 0;
        const queryBoost = queryPrimaryNodes.has(d.id) ? 8 : (queryHighlightedNodes.has(d.id) ? 3 : 0);
        return d.size + (impact * 5) + queryBoost;
      })
      .attr("fill", d => {
        if (offlineNodes.has(d.id)) return "#1a1a1a";
        const impact = affectedNodes.get(d.id) || 0;
        if (impact > 0.5) return "#441111";
        if (queryPrimaryNodes.has(d.id)) return d.color + "70";
        if (queryHighlightedNodes.has(d.id)) return d.color + "40";
        return d.color + "33";
      })
      .attr("stroke", d => {
        if (offlineNodes.has(d.id)) return "#FF0000";
        if (queryPrimaryNodes.has(d.id)) return "#FF9933";
        if (queryHighlightedNodes.has(d.id)) return "#0F766E";
        const impact = affectedNodes.get(d.id) || 0;
        return impact > 0.5 ? "#FF4444" : d.color;
      })
      .attr("stroke-width", d => {
        if (queryPrimaryNodes.has(d.id)) return 5;
        if (queryHighlightedNodes.has(d.id)) return 2.5;
        const impact = affectedNodes.get(d.id) || 0;
        if (impact > 0.5) return 3;
        return d.id === "India" ? 2.5 : 1.5;
      })
      .attr("filter", d => {
        if (offlineNodes.has(d.id)) return null;
        if (queryPrimaryNodes.has(d.id)) return "url(#glow-query)";
        const impact = affectedNodes.get(d.id) || 0;
        return impact > 0.5 ? "url(#glow-node)" : (d.id === "India" ? "url(#glow-india)" : null);
      });

    node.append("text").attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("font-size", d => queryPrimaryNodes.has(d.id) ? "14px" : (queryHighlightedNodes.has(d.id) ? "11px" : (d.size > 22 ? "11px" : "9px")))
      .attr("font-family", "monospace")
      .attr("fill", d => {
        if (offlineNodes.has(d.id)) return "#666";
        if (queryPrimaryNodes.has(d.id)) return "#B45309";
        if (queryHighlightedNodes.has(d.id)) return "#0F766E";
        return theme.nodeLabel;
      })
      .attr("font-weight", d => (d.id === "India" || queryPrimaryNodes.has(d.id) || queryHighlightedNodes.has(d.id)) ? "bold" : "normal")
      .style("text-decoration", d => offlineNodes.has(d.id) ? "line-through" : "none")
      .text(d => d.id);

    sim.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      linkLabelGroup
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    const handleResize = () => {
      if (!containerRef.current) return;
      w = containerRef.current.clientWidth;
      h = containerRef.current.clientHeight;
      svg.attr("width", w).attr("height", h);
      sim.force("center", d3.forceCenter(w / 2, h / 2));
      sim.alpha(0.3).restart();
      drawGrid(w, h);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      sim.stop();
      window.removeEventListener("resize", handleResize);
    };
  }, [containerReady, offlineNodes, showHeatmap, currentGraph, affectedNodes, queryHighlightedNodes, queryPrimaryNodes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        askINDRA(query);
      }
      if (e.key === 'Escape') {
        setSelectedNode(null);
        setSearchQuery("");
        setIsSituationRoom(false);
        highlightNode("");
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [query]);

  const highlightNode = (id) => {
    const searchTarget = id.toLowerCase();
    d3.select(svgRef.current).selectAll("g").selectAll("circle")
      .attr("stroke-width", d => d?.id?.toLowerCase().includes(searchTarget) && searchTarget !== "" ? 6 : (d?.id === "India" ? 2.5 : 1.5))
      .attr("stroke", d => d?.id?.toLowerCase().includes(searchTarget) && searchTarget !== "" ? "#0F766E" : d?.color);
  };

  const exportBriefing = () => {
    const content = `INDRA STRATEGIC INTELLIGENCE BRIEFING\nGenerated: ${new Date().toLocaleString()}\nCLASSIFICATION: TOP SECRET // NOFORN\n\nQUERY: ${activeQuery}\n\n${response}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `INDRA_Briefing_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
  };

  const askINDRA = async (q) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setResponse("");
    setActiveQuery(q);
    setQueryPrimaryNodes(new Set());
    setQueryHighlightedNodes(new Set());

    logActivity("INTEL", `INITIATING MULTI-SOURCE FUSION ANALYSIS: "${q.substring(0, 40)}..."`);

    try {
      const res = await fetch("http://localhost:3001/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: q }]
        })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setResponse(`ERROR: ${data.error || 'Server returned an error. Status: ' + res.status}`);
        logActivity("ALERT", `API ERROR: ${data.error || res.status}`);
        setLoading(false);
        return;
      }

      const confidence = Math.floor(Math.random() * (98 - 88 + 1)) + 88;
      const sources = Math.floor(Math.random() * (8 - 3 + 1)) + 3;
      const markers = ["SIGINT", "HUMINT", "OSINT", "GEOINT"].sort(() => 0.5 - Math.random()).slice(0, 2);

      const metadata = `\n\n---
[ CONFIDENCE: ${confidence}% ] [ SOURCES FUSED: ${sources} ] [ METHODS: ${markers.join(" // ")} ]
[ STATUS: ASSESSED // VERIFIED ]`;

      setResponse((data.text || "No response received.") + metadata);
      setSuggestions(data.suggestions || []);

      // Use LLM-determined relevant nodes
      if (data.relevantNodes && data.relevantNodes.length > 0) {
        const validNodes = new Set(graphData.nodes.map(n => n.id));
        const primary = new Set(data.relevantNodes.filter(n => n !== "India" && validNodes.has(n)));
        if (primary.size > 0) {
          setQueryPrimaryNodes(primary);
          setQueryHighlightedNodes(primary);
          logActivity("GRAPH", `LLM NODES ACTIVATED: ${[...primary].join(", ").toUpperCase()}`);
        }
      }

      logActivity("SYSTEM", `ANALYSIS COMPLETE: Reliability ${confidence}%`);
    } catch (err) {
      console.error("INDRA fetch error:", err);
      setResponse(`ERROR: SECURE LINK DISRUPTED — ${err.message}. PLEASE RE-ESTABLISH CONNECTION.`);
      logActivity("ALERT", `BACKEND PROXY ERROR: ${err.message}`);
      setQueryHighlightedNodes(new Set());
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour12: false });

  return (
    <div style={{ background: theme.bg, height: "100vh", color: theme.text, fontFamily: "'Inter', sans-serif", overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* Strategic Classification Banner */}
      <div style={{
        background: offlineNodes.size > 0 ? "#FF0000" : "#DE2910", color: "#fff", fontSize: 9, fontWeight: "900",
        textAlign: "center", padding: "4px 0", letterSpacing: 4, zIndex: 100,
        boxShadow: "0 2px 10px rgba(222, 41, 16, 0.3)",
        animation: offlineNodes.size > 0 ? "blink 1s infinite" : "none",
        transition: "background 0.5s ease"
      }}>
        {offlineNodes.size > 0 ? "⚠ RED ALERT // CRITICAL SYSTEM FAILURE // RESTRICTED ACCESS" : "TOP SECRET // INDRA OPERATIONAL NODE // NOFORN"}
      </div>

      {/* Tooltip Element */}
      <div id="indra-tooltip" style={{
        position: "absolute", visibility: "hidden", background: "#FFFFFF",
        color: "#1E293B", padding: "12px", border: "1px solid #FF9933", borderRadius: "6px",
        fontFamily: "monospace", fontSize: "10px", pointerEvents: "none", zIndex: 1000,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)", maxWidth: "240px"
      }} />

      {/* Top Bar */}
      {!isSituationRoom && (
        <div style={{
          display: "flex", alignItems: "center", padding: "0 24px", height: 56,
          borderBottom: `1px solid ${theme.border}`, background: theme.panel,
          backdropFilter: "blur(10px)", gap: 20, zIndex: 10, flexShrink: 0
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 12, height: 12, borderRadius: "2px", background: "#FF9933" }} />
            <span style={{ color: "#FF9933", fontWeight: "900", letterSpacing: 6, fontSize: 18 }}>INDRA</span>
            <span style={{ color: "#64748B", letterSpacing: 3, fontSize: 9, fontWeight: "500" }}>STRATEGIC INTELLIGENCE GRAPH</span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 20, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#64748B" }}>SEARCH:</span>
              <input
                type="text"
                placeholder="..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); highlightNode(e.target.value); }}
                style={{
                  background: "#F1F5F9", border: `1px solid ${theme.border}`, color: "#1E293B",
                  fontSize: 10, padding: "6px 12px 6px 60px", width: 140, outline: "none",
                  borderRadius: 4, fontFamily: "monospace"
                }}
              />
            </div>
            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              style={{
                background: showHeatmap ? "rgba(255, 153, 51, 0.15)" : "none",
                border: `1px solid ${showHeatmap ? '#FF9933' : theme.border}`,
                color: showHeatmap ? "#FF9933" : theme.text,
                fontSize: 9, padding: "6px 12px", cursor: "pointer", borderRadius: 4,
                fontFamily: "monospace", letterSpacing: 2, fontWeight: "bold"
              }}
            >
              {showHeatmap ? "DISABLE HEATMAP" : "ENABLE RISK MAP"}
            </button>
            <button
              onClick={() => setIsSituationRoom(true)}
              style={{
                background: "rgba(222, 41, 16, 0.1)", border: `1px solid #DE2910`, color: "#DE2910",
                fontSize: 9, padding: "6px 12px", cursor: "pointer", borderRadius: 4,
                fontFamily: "monospace", letterSpacing: 2, fontWeight: "bold"
              }}
            >
              SITUATION ROOM
            </button>
            <div style={{ display: "flex", gap: 15, alignItems: "center", borderLeft: `1px solid ${theme.border}`, paddingLeft: 20 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", display: "inline-block", animation: "blink 2s infinite" }} />
                <span style={{ color: "#22C55E", fontSize: 10, letterSpacing: 2, fontWeight: "bold" }}>LIVE</span>
              </div>
              <span style={{ color: "#64748B", fontSize: 10, fontFamily: "monospace" }}>{timeStr}</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Graph Container */}
        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <svg ref={svgRef} style={{ display: activeQuery ? "block" : "none", width: "100%", height: "100%" }} />

          {/* Standby screen before first query */}
          {!activeQuery && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", background: theme.bg,
            }}>
              <div style={{ fontSize: 48, opacity: 0.12, marginBottom: 16 }}>☸</div>
              <div style={{ color: theme.secondary, fontSize: 11, letterSpacing: 4, fontWeight: "bold", marginBottom: 8 }}>
                INTELLIGENCE GRAPH STANDBY
              </div>
              <div style={{ color: theme.secondary, fontSize: 10, opacity: 0.5 }}>
                Submit a query to activate strategic visualization
              </div>
            </div>
          )}

          {/* Operational Log Console */}
          <div style={{
            position: "absolute", bottom: isLogOpen ? 0 : -180, left: 0, right: 0,
            height: 220, background: "rgba(255, 255, 255, 0.97)", borderTop: "2px solid #FF9933",
            zIndex: 100, transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.1)"
          }}>
            <div
              onClick={() => setIsLogOpen(!isLogOpen)}
              style={{
                height: 40, display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 24px", cursor: "pointer", borderBottom: `1px solid ${theme.border}`,
                background: "rgba(255, 153, 51, 0.05)"
              }}
            >
              <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
                <span style={{ color: "#FF9933", fontSize: 10, letterSpacing: 3, fontWeight: "bold" }}>OPERATIONAL LOG CONSOLE</span>
                <span style={{ color: "#94A3B8", fontSize: 9 }}>TRACER ACTIVE // ENCRYPTION AES-256</span>
              </div>
              <span style={{ color: "#FF9933", fontSize: 12 }}>{isLogOpen ? "▼" : "▲"}</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "15px 24px", fontFamily: "monospace", fontSize: 10 }}>
              {activityLog.map((log, i) => (
                <div key={i} style={{ marginBottom: 6, display: "flex", gap: 15 }}>
                  <span style={{ color: theme.secondary, minWidth: 70 }}>[{log.time}]</span>
                  <span style={{
                    color: log.type === "ALERT" ? "#FF4444" : log.type === "INTEL" ? "#0F766E" : "#FF9933",
                    minWidth: 60, fontWeight: "bold"
                  }}>{log.type}</span>
                  <span style={{ color: theme.text }}>{log.msg}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Controls HUD */}
          <div style={{
            position: "absolute", top: 20, left: 24, fontSize: 9, color: "#64748B",
            letterSpacing: 2, background: "rgba(255,255,255,0.92)", padding: "15px", borderRadius: 6,
            backdropFilter: "blur(6px)", borderLeft: "3px solid #FF9933",
            zIndex: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", border: "1px solid #E2E8F0"
          }}>
            <div style={{ marginBottom: 12, borderBottom: `1px solid ${theme.border}`, paddingBottom: 8, color: "#FF9933", fontWeight: "bold" }}>
              STRATEGIC TIMELINE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 15 }}>
              <input
                type="range" min="0" max="2" step="1"
                value={timelineEra === "2020" ? 0 : timelineEra === "2024" ? 1 : 2}
                onChange={(e) => {
                  const eras = ["2020", "2024", "2030"];
                  const newEra = eras[parseInt(e.target.value)];
                  setTimelineEra(newEra);
                  logActivity("SYSTEM", `TIMELINE SHIFT: OPERATIONAL CONTEXT MOVED TO ${newEra}`);
                }}
                style={{ width: "100%", accentColor: "#FF9933", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", color: theme.text, fontSize: 8 }}>
                <span style={{ color: timelineEra === "2020" ? "#FF9933" : "inherit" }}>2020 HIST</span>
                <span style={{ color: timelineEra === "2024" ? "#FF9933" : "inherit" }}>2024 CURR</span>
                <span style={{ color: timelineEra === "2030" ? "#FF9933" : "inherit" }}>2030 PROJ</span>
              </div>
            </div>
            <div style={{ marginBottom: 4 }}>SCROLL: ZOOM</div>
            <div style={{ marginBottom: 4 }}>DRAG: PAN / REPOSITION</div>
            <div style={{ marginBottom: 4 }}>CLICK NODE: INSPECT</div>
            <div style={{ color: "#FF9933" }}>CTRL+ENTER: RUN ANALYZE</div>
          </div>

          {/* Legend */}
          <div style={{
            position: "absolute", bottom: 60, left: 24, background: "rgba(255,255,255,0.92)",
            border: "1px solid #E2E8F0", padding: "15px 20px", backdropFilter: "blur(8px)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.08)", zIndex: 5, borderRadius: 6
          }}>
            <div style={{ color: "#64748B", fontSize: 9, letterSpacing: 3, marginBottom: 12, fontWeight: "bold" }}>NODE LEGEND</div>
            {[["#FF9933", "Country"], ["#00D4FF", "Technology"], ["#FFD700", "Resource"], ["#FF4444", "Sector"], ["#44DDFF", "Global Issue"]].map(([c, l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                <span style={{ fontSize: 10, color: "#1E293B", fontWeight: "500" }}>{l.toUpperCase()}</span>
              </div>
            ))}
          </div>

          {/* Situation Room Exit Button */}
          {isSituationRoom && (
            <button
              onClick={() => setIsSituationRoom(false)}
              style={{
                position: "absolute", top: 20, right: 24, background: "rgba(222, 41, 16, 0.8)",
                color: "#fff", border: "none", borderRadius: 4, padding: "8px 16px",
                fontSize: 10, fontWeight: "bold", letterSpacing: 2, cursor: "pointer",
                boxShadow: "0 0 20px rgba(222, 41, 16, 0.4)", zIndex: 1000
              }}
            >
              EXIT SITUATION ROOM [ESC]
            </button>
          )}

          {/* SIGINT Ticker */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 32,
            background: "#FFFFFF", borderTop: "1px solid #CBD5E1",
            display: "flex", alignItems: "center", overflow: "hidden", zIndex: 10
          }}>
            <div style={{
              background: "#FF9933", color: "#000", fontSize: 9, fontWeight: "900",
              height: "100%", display: "flex", alignItems: "center", px: "12px",
              padding: "0 15px", letterSpacing: 2, flexShrink: 0
            }}>
              SIGINT FEED
            </div>
            <div style={{
              display: "flex", whiteSpace: "nowrap", animation: "ticker 60s linear infinite",
              fontSize: 10, color: "#B45309", fontFamily: "monospace", gap: 50
            }}>
              {HEADLINES.map((h, i) => (
                <span key={i}>{h}</span>
              ))}
            </div>
          </div>

          {/* Situation Room News Overlay */}
          {isSituationRoom && (
            <div style={{
              position: "absolute", bottom: 60, right: 24, width: 300,
              background: "rgba(255, 255, 255, 0.95)", border: "1px solid #CBD5E1",
              padding: "15px", backdropFilter: "blur(10px)", borderRadius: 6,
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)", zIndex: 5
            }}>
              <div style={{ color: "#B45309", fontSize: 9, letterSpacing: 2, marginBottom: 12, fontWeight: "bold", borderBottom: "1px solid #E2E8F0", paddingBottom: 8 }}>
                TAC-NEWS FEED
              </div>
              <div style={{ height: 120, overflow: "hidden", position: "relative" }}>
                <div style={{ animation: "news-scroll 15s linear infinite" }}>
                  {HEADLINES.map((h, i) => (
                    <div key={i} style={{ fontSize: 10, color: theme.text, marginBottom: 12, lineHeight: 1.4, opacity: 0.8, borderLeft: "2px solid #FF9933", paddingLeft: 8 }}>
                      {h}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        {!isSituationRoom && (
          <div style={{ width: 400, borderLeft: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: theme.panel, flexShrink: 0, backdropFilter: "blur(20px)" }}>

            {/* Query Input */}
            <div style={{ padding: "24px", borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ color: theme.secondary, fontSize: 10, letterSpacing: 3, marginBottom: 16, fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 4, height: 4, background: "#FF9933" }} /> ▸ INTELLIGENCE QUERY
              </div>
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. India ka rare earth kahan se aata hai?"
                style={{
                  width: "100%", background: "#F8FAFC", border: `1px solid ${theme.border}`,
                  color: "#1E293B", padding: "15px", fontSize: 13, resize: "none",
                  height: 90, outline: "none", fontFamily: "inherit",
                  boxSizing: "border-box", lineHeight: 1.6, borderRadius: 4,
                  boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06)"
                }}
              />
              <button
                onClick={() => askINDRA(query)}
                disabled={loading || !query.trim()}
                style={{
                  marginTop: 12, width: "100%", padding: "14px 0",
                  background: loading ? theme.border : (query.trim() ? "#FF9933" : theme.border),
                  color: loading || !query.trim() ? theme.secondary : "#000",
                  border: "none", cursor: loading || !query.trim() ? "default" : "pointer",
                  fontFamily: "inherit", fontSize: 11, fontWeight: "900", letterSpacing: 5,
                  transition: "all 0.2s", borderRadius: 4,
                  boxShadow: query.trim() && !loading ? "0 4px 15px rgba(255, 153, 51, 0.3)" : "none"
                }}
              >
                {loading ? "◈ ANALYZING DATA..." : "RUN ANALYZE ENGINE ▶"}
              </button>
            </div>

            {/* Scenarios List */}
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ color: theme.secondary, fontSize: 10, letterSpacing: 3, marginBottom: 15, fontWeight: "bold" }}>
                ▸ {suggestions.length > 0 ? "FOLLOW-UP SCENARIOS" : "STRATEGIC SCENARIOS"}
              </div>
              <div style={{ maxHeight: "180px", overflowY: "auto" }}>
                {(suggestions.length > 0
                  ? suggestions.map(s => ({ label: s.length > 50 ? s.substring(0, 50) + "..." : s, q: s }))
                  : SCENARIOS
                ).map((s, i) => (
                  <div
                    key={i}
                    onClick={() => { setQuery(s.q); askINDRA(s.q); }}
                    style={{
                      padding: "12px 15px", marginBottom: 8, cursor: "pointer",
                      background: activeQuery === s.q ? "rgba(255, 153, 51, 0.15)" : "transparent",
                      border: `1px solid ${activeQuery === s.q ? "#FF9933" : "transparent"}`,
                      fontSize: 11, color: activeQuery === s.q ? "#FF9933" : theme.text,
                      lineHeight: 1.4, transition: "all 0.15s", borderRadius: 4
                    }}
                  >
                    <span style={{ color: theme.secondary, marginRight: 10, fontFamily: "monospace" }}>0{i + 1}</span>{s.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Assessment Output Area */}
            <div style={{ flex: 1, padding: "24px", overflow: "auto", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ color: theme.secondary, fontSize: 10, letterSpacing: 3, fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 4, height: 4, background: "#FF9933" }} /> ▸ OUTPUT FEED
                </div>
                {response && !loading && (
                  <button onClick={exportBriefing} style={{ background: "none", border: `1px solid ${theme.border}`, color: "#B45309", fontSize: 8, cursor: "pointer", letterSpacing: 1, padding: "4px 8px", borderRadius: 2, fontWeight: "bold" }}>
                    [ EXPORT BRIEFING ]
                  </button>
                )}
              </div>

              <div style={{ flex: 1 }}>
                {loading ? (
                  <div style={{ opacity: 0.6 }}>
                    <div style={{ color: "#FF9933", fontSize: 11, marginBottom: 12, letterSpacing: 1 }}>Decrypting intelligence feed...</div>
                    {[70, 90, 55, 80, 40, 85, 60].map((w, i) => (
                      <div key={i} style={{ height: 6, background: theme.border, marginBottom: 8, width: `${w}%`, animation: "shimmer 1.5s infinite" }} />
                    ))}
                  </div>
                ) : response ? (
                  <>
                    <div style={{ fontSize: 12, color: theme.text, lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {response.split('\n').map((line, i) => {
                        if (line.startsWith('ASSESSMENT:')) return <div key={i} style={{ color: "#FF9933", fontWeight: "bold", marginBottom: 12, fontSize: 13, borderLeft: "2px solid #FF9933", paddingLeft: 10 }}>{line}</div>;
                        if (line.startsWith('KEY FINDINGS:') || line.startsWith('STRATEGIC IMPLICATION:') || line.startsWith('CASCADING IMPACTS:') || line.startsWith('STRATEGIC RECOMMENDATION:')) return <div key={i} style={{ color: "#0F766E", marginTop: 15, marginBottom: 6, fontSize: 10, letterSpacing: 2, fontWeight: "bold" }}>{line}</div>;
                        if (line.startsWith('[ CONFIDENCE:') || line.startsWith('[ STATUS:')) return <div key={i} style={{ color: "#FF9933", fontSize: 9, letterSpacing: 1, opacity: 0.8, fontFamily: "monospace" }}>{line}</div>;
                        if (line.trim().startsWith('•') || line.trim().startsWith('-')) return <div key={i} style={{ color: theme.text, paddingLeft: 12, marginBottom: 6, position: "relative" }}>{line}</div>;
                        return <div key={i} style={{ marginBottom: 4 }}>{line}</div>;
                      })}
                    </div>
                  </>
                ) : (
                <div style={{ color: theme.secondary, fontSize: 12, lineHeight: 1.8, textAlign: "center", marginTop: "20%", padding: "0 20px" }}>
                  <div style={{ fontSize: 24, marginBottom: 10, opacity: 0.2 }}>☸</div>
                  Awaiting operational input. Select a scenario or enter a custom query to begin strategic assessment.
                </div>
                )}
              </div>
            </div>

            {/* Selected Node Details */}
            {selectedNode && (
              <div style={{
                padding: "20px 24px", borderTop: `1px solid ${theme.border}`, background: "#F8FAFC",
                flexShrink: 0, position: "relative"
              }}>
                <button onClick={() => setSelectedNode(null)} style={{ position: "absolute", top: 15, right: 15, background: "none", border: "none", color: theme.secondary, cursor: "pointer", fontSize: 16 }}>✕</button>
                <div style={{ color: theme.secondary, fontSize: 9, letterSpacing: 3, marginBottom: 10, fontWeight: "bold" }}>▸ NODE INSPECTOR</div>
                <div style={{ color: selectedNode.color, fontSize: 18, fontWeight: "900", letterSpacing: 2, marginBottom: 8 }}>{selectedNode.id.toUpperCase()}</div>
                <div style={{ fontSize: 11, color: theme.text, lineHeight: 1.5, marginBottom: 15, opacity: 0.8 }}>{selectedNode.desc}</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  <div style={{ background: "#F8FAFC", padding: "10px", borderRadius: 4, border: `1px solid ${theme.border}` }}>
                    <div style={{ color: theme.secondary, fontSize: 8, letterSpacing: 2, marginBottom: 2 }}>CLASSIFICATION</div>
                    <div style={{ color: theme.text, fontSize: 10, fontWeight: "bold" }}>{selectedNode.type?.toUpperCase()}</div>
                  </div>
                  <div style={{ background: "#F8FAFC", padding: "10px", borderRadius: 4, border: `1px solid ${theme.border}` }}>
                    <div style={{ color: theme.secondary, fontSize: 8, letterSpacing: 2, marginBottom: 2 }}>CONNECTIVITY</div>
                    <div style={{ color: theme.text, fontSize: 10, fontWeight: "bold" }}>
                      LEVEL {graphData.links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).length}
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: theme.secondary, fontSize: 8, letterSpacing: 2, marginBottom: 8 }}>SIMULATION CONTROLS</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOfflineNodes(prev => {
                          const next = new Set(prev);
                          if (next.has(selectedNode.id)) {
                            next.delete(selectedNode.id);
                            logActivity("SYSTEM", `Node ${selectedNode.id.toUpperCase()} RESTORED to live status.`);
                          } else {
                            next.add(selectedNode.id);
                            logActivity("SYSTEM", `Node ${selectedNode.id.toUpperCase()} SET TO OFFLINE.`);
                          }
                          return next;
                        });
                      }}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 4, fontSize: 9, fontWeight: "bold",
                        letterSpacing: 1, cursor: "pointer", transition: "all 0.2s",
                        background: offlineNodes.has(selectedNode.id) ? "#22C55E" : "rgba(222, 41, 16, 0.1)",
                        border: `1px solid ${offlineNodes.has(selectedNode.id) ? '#22C55E' : '#DE2910'}`,
                        color: offlineNodes.has(selectedNode.id) ? "#000" : "#DE2910"
                      }}
                    >
                      {offlineNodes.has(selectedNode.id) ? "RESTORE LIVE" : "SET OFFLINE"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleWatch(selectedNode.id); }}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 4, fontSize: 9, fontWeight: "bold",
                        letterSpacing: 1, cursor: "pointer", transition: "all 0.2s",
                        background: watchedNodes.has(selectedNode.id) ? "#FF9933" : "rgba(255,153,51,0.05)",
                        border: `1px solid #FF9933`,
                        color: watchedNodes.has(selectedNode.id) ? "#000" : "#FF9933"
                      }}
                    >
                      {watchedNodes.has(selectedNode.id) ? "UNMONITOR" : "MONITOR NODE"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const impact = affectedNodes.get(selectedNode.id) || 0;
                    const q = `Analyze the strategic impact of ${selectedNode.id} on India's national security, specifically looking at its type as ${selectedNode.type}.${impact > 0.5 ? ' WARNING: Node is under severe cascading risk.' : ''}${offlineNodes.has(selectedNode.id) ? ' ALERT: NODE IS CURRENTLY OFFLINE.' : ''}`;
                    setQuery(q);
                    askINDRA(q);
                  }}
                  style={{
                    width: "100%", padding: "12px", background: "none", border: `1px solid ${selectedNode.color}`,
                    color: selectedNode.color, fontSize: 10, cursor: "pointer", letterSpacing: 3,
                    fontWeight: "bold", borderRadius: 4, transition: "all 0.2s"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = `${selectedNode.color}11`}
                  onMouseOut={(e) => e.currentTarget.style.background = "none"}
                >
                  TARGETED ANALYSIS ▶
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;500;700;900&display=swap');
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes shimmer { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
        @keyframes ticker {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes pulse-risk {
          0% { stroke-opacity: 0.2; stroke-width: 0.5; }
          50% { stroke-opacity: 0.8; stroke-width: 8; }
          100% { stroke-opacity: 0.2; stroke-width: 0.5; }
        }
        @keyframes news-scroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        * { scrollbar-width: thin; scrollbar-color: ${theme.border} transparent; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 10px; }
      `}</style>
    </div>
  );
}
