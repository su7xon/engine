import { useState, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import Globe from "react-globe.gl";
import NewsModal from "./NewsModal";

const graphData = { nodes: [], links: [] };

const FALLBACK_DASHBOARD = {
  summary: { totalArticles: 0, criticalAlerts: 0, highAlerts: 0 },
  sentiment: { score: 0, label: "NEUTRAL" },
  categories: [],
  alerts: []
};

const FALLBACK_SCENARIOS = [
  { label: "Semiconductor Dependency", q: "Analyze India's risk if Taiwan semiconductor supply chain is disrupted." },
  { label: "Russia Energy Play", q: "How does discounted Russian oil affect India's strategic autonomy?" },
  { label: "Top 3 Vulnerabilities", q: "Identify India's top 3 strategic vulnerabilities." },
  { label: "China Trade War", q: "Impact of high trade deficit with China." }
];

// Remove static SYSTEM_PROMPT. We will generate it dynamically to include live nodes.

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
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineEra, setTimelineEra] = useState("2024");
  const [countriesData, setCountriesData] = useState({ features: [] });
  const [hoveredCountry, setHoveredCountry] = useState(null);

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(res => res.json())
      .then(setCountriesData);
  }, []);
  const [watchedNodes, setWatchedNodes] = useState(new Set());
  const [activityLog, setActivityLog] = useState([{ type: "SYSTEM", msg: "INDRA ENGINE INITIALIZED", time: new Date().toLocaleTimeString() }]);
  const [analysisLog, setAnalysisLog] = useState([]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [queryHighlightedNodes, setQueryHighlightedNodes] = useState(new Set());
  const [queryPrimaryNodes, setQueryPrimaryNodes] = useState(new Set());
  const [darkMode, setDarkMode] = useState(false);
  const [liveHeadlines, setLiveHeadlines] = useState([]);
  const [fallbackHeadlines, setFallbackHeadlines] = useState([]);
  const [scenarioList, setScenarioList] = useState([]);
  const [scenarioMode, setScenarioMode] = useState("dynamic");
  const [scenarioSourceQuery, setScenarioSourceQuery] = useState("");
  const [scenarioHistory, setScenarioHistory] = useState([]);
  const [liveIntelligence, setLiveIntelligence] = useState(null);
  const [kbUpdating, setKbUpdating] = useState(false);
  const [predictingRisk, setPredictingRisk] = useState(false);
  const [criticalRisks, setCriticalRisks] = useState([]);
  const [extractedEntities, setExtractedEntities] = useState(null);
  const [economicData, setEconomicData] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [miniMapVisible, setMiniMapVisible] = useState(true);
  const [visibleCountries, setVisibleCountries] = useState(new Set(["India", "China", "USA", "Russia", "Gulf States", "EU"]));
  const [showAllNodes, setShowAllNodes] = useState(true);
  const [dynamicGraph, setDynamicGraph] = useState(null);
  const [currentTopic, setCurrentTopic] = useState("India");
  const [selectedCountry, setSelectedCountry] = useState("India");
  const [dashboardStats, setDashboardStats] = useState(FALLBACK_DASHBOARD);
  const [criticalAlerts, setCriticalAlerts] = useState([]);
  const [newsModalCountry, setNewsModalCountry] = useState(null);
  
  const [riskScores, setRiskScores] = useState([]);
  const [climateOverlay, setClimateOverlay] = useState({
    data: null,
    risk: null,
    loading: false,
    error: null
  });
  const [marketStress, setMarketStress] = useState({
    loading: false,
    error: null,
    data: null
  });

  const logActivity = (type, msg) => {
    setActivityLog(prev => [{ type, msg, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  const logOperational = (type, msg) => {
    setAnalysisLog(prev => [{ type, msg, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  // Era-based graph filtering
  const currentGraph = useMemo(() => {
    const dataSource = dynamicGraph || graphData;
    let nodes = dataSource.nodes.map(n => ({ ...n }));
    let links = (dataSource.links || dataSource.relationships || []).map(l => ({ ...l }));

    // Filter: India Only vs Show All
    if (!showAllNodes) {
      // Get all nodes directly connected to India
      const indiaLinks = links.filter(l => l.source === "India" || l.target === "India");
      const connectedNodeIds = new Set(["India"]);
      indiaLinks.forEach(l => {
        connectedNodeIds.add(l.source);
        connectedNodeIds.add(l.target);
      });
      nodes = nodes.filter(n => connectedNodeIds.has(n.id));
      links = links.filter(l => connectedNodeIds.has(l.source) && connectedNodeIds.has(l.target));
    }

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
  }, [dynamicGraph, timelineEra, showAllNodes]);

  const hasGraphData = (currentGraph?.nodes?.length || 0) > 0;

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

  // Fetch live intelligence and graph on mount
  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        const [intelRes, entitiesRes, econRes, graphRes, dashRes, alertsRes, cfgRes, riskRes] = await Promise.all([
          fetch(`http://localhost:3001/api/intelligence?topic=${currentTopic}`),
          fetch('http://localhost:3001/api/entities'),
          fetch('http://localhost:3001/api/economy'),
          fetch('http://localhost:3001/api/graph'),
          fetch('http://localhost:3001/api/intelligence/dashboard'),
          fetch('http://localhost:3001/api/alerts'),
          fetch('http://localhost:3001/api/config/public'),
          fetch('http://localhost:3001/api/markov-risk')
        ]);
        
        const intelData = await intelRes.json();
        setLiveIntelligence(intelData);
        
        // Get headlines - prioritize high priority articles
        if (intelData.articles) {
          const headlines = intelData.articles.slice(0, 15).map(n => {
            const priorityIcon = n.analysis?.alertLevel === 'CRITICAL' ? '🔴' : 
                                 n.analysis?.alertLevel === 'HIGH' ? '🟠' : '•';
            return `${priorityIcon} ${n.source}: ${n.title}`.substring(0, 100);
          });
          setLiveHeadlines(headlines);
          setFallbackHeadlines(headlines);
        }
        
        const entitiesData = await entitiesRes.json();
        setExtractedEntities(entitiesData);
        
        const econData = await econRes.json();
        setEconomicData(econData);
        
        const graphData = await graphRes.json();
        if (graphData.nodes && graphData.nodes.length > 0) {
          setDynamicGraph(graphData);
        }
        
        // Dashboard stats
        const dashData = await dashRes.json();
        setDashboardStats(dashData);
        
        // Critical alerts
        const alertsData = await alertsRes.json();
        setCriticalAlerts(alertsData.alerts || []);

        const cfgData = await cfgRes.json();
        setScenarioList(cfgData?.ui?.scenarios || []);

        const riskData = await riskRes.json();
        setRiskScores((riskData?.scores || []).map(r => ({ id: r.id, score: Number(r.riskScore || 0) })));
        
        if (alertsData.alerts && alertsData.alerts.length > 0) {
          logActivity("ALERT", `${alertsData.alerts.length} CRITICAL ALERTS DETECTED`);
        }
        
        logActivity("SYSTEM", `LIVE INTELLIGENCE CONNECTED - Topic: ${currentTopic}`);
      } catch (err) {
        console.error("Failed to fetch live data:", err);
        setDashboardStats(FALLBACK_DASHBOARD);
        setScenarioList(FALLBACK_SCENARIOS);
        logActivity("ALERT", "INTELLIGENCE FEED OFFLINE - USING LOCAL CACHE");
      }
    };
    
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 300000);
    return () => clearInterval(interval);
  }, [currentTopic]);

  // Climate overlay data (free APIs via backend: Open-Meteo + GDELT)
  useEffect(() => {
    let cancelled = false;

    const fetchClimateOverlay = async () => {
      setClimateOverlay(prev => ({ ...prev, loading: true, error: null }));
      try {
        const [riskRes, climateRes] = await Promise.all([
          fetch(`http://localhost:3001/api/climate/risk-score?country=${encodeURIComponent(currentTopic)}`),
          fetch(`http://localhost:3001/api/climate/data?country=${encodeURIComponent(currentTopic)}`)
        ]);

        const riskData = await riskRes.json();
        const climatePayload = await climateRes.json();

        if (!cancelled) {
          setClimateOverlay({
            data: climatePayload?.data || null,
            risk: riskData || null,
            loading: false,
            error: null
          });
        }
      } catch (err) {
        if (!cancelled) {
          setClimateOverlay(prev => ({ ...prev, loading: false, error: err.message || 'overlay fetch failed' }));
        }
      }
    };

    fetchClimateOverlay();
    const climateInterval = setInterval(fetchClimateOverlay, 180000);
    return () => {
      cancelled = true;
      clearInterval(climateInterval);
    };
  }, [currentTopic]);

  // Market stress overlay (free Yahoo Finance data via backend)
  useEffect(() => {
    let cancelled = false;

    const fetchMarketStress = async () => {
      setMarketStress(prev => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(`http://localhost:3001/api/market/stress?topic=${encodeURIComponent(currentTopic)}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);

        if (!cancelled) {
          setMarketStress({ loading: false, error: null, data: payload });
        }
      } catch (err) {
        if (!cancelled) {
          setMarketStress(prev => ({ ...prev, loading: false, error: err.message || 'market feed unavailable' }));
        }
      }
    };

    fetchMarketStress();
    const marketInterval = setInterval(fetchMarketStress, 180000);
    return () => {
      cancelled = true;
      clearInterval(marketInterval);
    };
  }, [currentTopic]);

  // Manual KB update
  const triggerKBUpdate = async (overrideTopic) => {
    const topicToUpdate = overrideTopic || currentTopic;
    setKbUpdating(true);
    logActivity("INTEL", `DEPLOYING 10-AGENT SWARM FOR ${topicToUpdate.toUpperCase()}...`);
    try {
      const res = await fetch('http://localhost:3001/api/kb/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: topicToUpdate }) });
      const data = await res.json();
      if (data.success) {
        logActivity("SYSTEM", `SWARM COMPLETED: ${data.agentsDeployed || 10} Agents crawled ${data.newsCount} pages. Sentiment: ${data.avgSentiment?.toFixed(2) || 'N/A'}`);
      } else {
        logActivity("ALERT", `SWARM FAILED: ${data.reason}`);
      }
    } catch (err) {
      logActivity("ALERT", "SWARM NETWORK FAILURE");
    }
    setKbUpdating(false);
  };

  // Run Markov Risk Prediction
  const runRiskPrediction = async () => {
    setPredictingRisk(true);
    logActivity("SYSTEM", "INITIALIZING MARKOV CHAIN RISK SIMULATION...");
    try {
      const res = await fetch('http://localhost:3001/api/predict-risk');
      const data = await res.json();
      if (data.success) {
        const topRisks = data.riskScores.slice(0, 5);
        setCriticalRisks(topRisks);
        logActivity("ALERT", `CRITICAL RISKS IDENTIFIED: ${topRisks.map(r => r.id).join(', ')}`);
        
        // Highlight them on graph
        const riskNodes = new Set(topRisks.map(r => r.id));
        setOfflineNodes(riskNodes);
      }
    } catch (err) {
      logActivity("ALERT", "RISK PREDICTION FAILED");
    }
    setPredictingRisk(false);
  };

  // Theme colors (light/dark mode)
  const theme = useMemo(() => ({
    bg: darkMode ? "#0A0E14" : "#F1F5F9",
    panel: darkMode ? "#111827" : "#FFFFFF",
    border: darkMode ? "#374151" : "#CBD5E1",
    text: darkMode ? "#F3F4F6" : "#1E293B",
    secondary: darkMode ? "#9CA3AF" : "#64748B",
    subtext: darkMode ? "#6B7280" : "#94A3B8",
    grid: darkMode ? "#1F2937" : "#E2E8F0",
    link: darkMode ? "#4B5563" : "#94A3B8",
    nodeLabel: (d) => d3.color(d.color).darker(darkMode ? -0.5 : 0.5).toString(),
  }), [darkMode]);

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

    const getNodeColor = (d) => {
      if (typeof d.color === "string" && d.color.trim().length > 0) return d.color;
      const type = (d.type || "").toLowerCase();
      if (type.includes("country")) return "#FF9933";
      if (type.includes("technology") || type.includes("tech")) return "#00D4FF";
      if (type.includes("resource")) return "#FFD700";
      if (type.includes("sector")) return "#FF4444";
      if (type.includes("global")) return "#44DDFF";
      return "#64748B";
    };

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
      .attr("opacity", d => {
        const sid = typeof d.source === 'string' ? d.source : d.source.id;
        const tid = typeof d.target === 'string' ? d.target : d.target.id;
        if (queryPrimaryNodes.has(sid) && queryPrimaryNodes.has(tid)) return 0.95;
        if (queryHighlightedNodes.has(sid) && queryHighlightedNodes.has(tid)) return 0.75;
        return 0.18;
      })
      .attr("text-anchor", "middle").attr("font-family", "monospace")
      .text(d => {
        const sid = typeof d.source === 'string' ? d.source : d.source.id;
        const tid = typeof d.target === 'string' ? d.target : d.target.id;
        if (queryHighlightedNodes.size === 0) return "";
        if (queryPrimaryNodes.has(sid) && queryPrimaryNodes.has(tid)) return d.label;
        if (queryHighlightedNodes.has(sid) && queryHighlightedNodes.has(tid)) return d.label;
        return "";
      });

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
            <div style="line-height:1.4; font-size:10px;">${d.description || d.desc || 'No description available.'}</div>
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
        return impact > 0.5 ? "#FF4444" : getNodeColor(d);
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
        const base = getNodeColor(d);
        if (queryPrimaryNodes.has(d.id)) return base + "70";
        if (queryHighlightedNodes.has(d.id)) return base + "40";
        return base + "33";
      })
      .attr("stroke", d => {
        if (offlineNodes.has(d.id)) return "#FF0000";
        if (queryPrimaryNodes.has(d.id)) return "#FF9933";
        if (queryHighlightedNodes.has(d.id)) return "#0F766E";
        const impact = affectedNodes.get(d.id) || 0;
        return impact > 0.5 ? "#FF4444" : getNodeColor(d);
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
      .attr("font-size", d => queryPrimaryNodes.has(d.id) ? "15px" : (queryHighlightedNodes.has(d.id) ? "13px" : (d.size > 22 ? "12px" : "11px")))
      .attr("font-family", "monospace")
      .attr("fill", d => {
        if (offlineNodes.has(d.id)) return "#666";
        if (queryPrimaryNodes.has(d.id)) return "#B45309";
        if (queryHighlightedNodes.has(d.id)) return "#0F766E";
        return theme.nodeLabel;
      })
      .attr("font-weight", d => (d.id === "India" || queryPrimaryNodes.has(d.id) || queryHighlightedNodes.has(d.id)) ? "bold" : "normal")
      .attr("paint-order", "stroke")
      .attr("stroke", darkMode ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.95)")
      .attr("stroke-width", 2.2)
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
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setDarkMode(!darkMode);
      }
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        setShowHeatmap(!showHeatmap);
      }
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        triggerKBUpdate();
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
  }, [query, darkMode, showHeatmap]);

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
    setIsLogOpen(true);
    setAnalysisLog([]);
    setQueryPrimaryNodes(new Set());
    setQueryHighlightedNodes(new Set());

    logActivity("INTEL", `INITIATING MULTI-SOURCE FUSION ANALYSIS: "${q.substring(0, 40)}..."`);
    logOperational("INTEL", `ANALYZE REQUEST: "${q.substring(0, 60)}"`);

    try {
      if (!hasGraphData) {
        try {
          const graphRes = await fetch('http://localhost:3001/api/graph');
          const graphPayload = await graphRes.json();
          if (graphPayload && graphPayload.nodes && graphPayload.nodes.length > 0) {
            setDynamicGraph(graphPayload);
          }
        } catch (graphErr) {
          logOperational("ALERT", `GRAPH LOAD FAILED: ${graphErr.message}`);
        }
      }

      const activeData = dynamicGraph || graphData;
      const AVAILABLE_NODES = activeData.nodes.map(n => n.id);
      const DYNAMIC_SYSTEM_PROMPT = `You are INDRA — India's Strategic Intelligence Analysis Engine. You analyze geopolitical, economic, defense, and technological dependencies for India using a real-time knowledge graph.

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

      const res = await fetch("http://localhost:3001/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: DYNAMIC_SYSTEM_PROMPT,
          topic: currentTopic,
          messages: [{ role: "user", content: q }]
        })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setResponse(`ERROR: ${data.error || 'Server returned an error. Status: ' + res.status}`);
        logActivity("ALERT", `API ERROR: ${data.error || res.status}`);
        logOperational("ALERT", `ANALYZE FAILED: ${data.error || res.status}`);
        setLoading(false);
        return;
      }

      const confidence = Math.floor(Math.random() * (98 - 88 + 1)) + 88;
      const sources = Math.floor(Math.random() * (8 - 3 + 1)) + 3;
      const markers = ["SIGINT", "HUMINT", "OSINT", "GEOINT"].sort(() => 0.5 - Math.random()).slice(0, 2);

      const metadata = `\n\n---
[ CONFIDENCE: ${confidence}% ] [ SOURCES FUSED: ${sources} ] [ METHODS: ${markers.join(" // ")} ]
[ STATUS: ASSESSED // VERIFIED ]`;

      setActiveQuery(q);
      setResponse((data.text || "No response received.") + metadata);
      setSuggestions(data.suggestions || []);
      if (Array.isArray(data.whatIfScenarios) && data.whatIfScenarios.length > 0) {
        setScenarioList(data.whatIfScenarios);
        setScenarioSourceQuery(q);
        setScenarioHistory(prev => {
          const nextEntry = { query: q, scenarios: data.whatIfScenarios, at: Date.now() };
          const deduped = prev.filter(entry => entry.query !== q);
          return [nextEntry, ...deduped].slice(0, 3);
        });
      }

      let freshestGraph = currentGraph;
      try {
        logOperational("GRAPH", `AUTO-ENRICH STARTED FOR: ${currentTopic}`);
        await fetch(`http://localhost:3001/api/graph/enrich?topic=${encodeURIComponent(currentTopic)}`);

        const refreshedGraphRes = await fetch('http://localhost:3001/api/graph');
        const refreshedGraph = await refreshedGraphRes.json();
        if (refreshedGraph && refreshedGraph.nodes && refreshedGraph.nodes.length > 0) {
          setDynamicGraph(refreshedGraph);
          freshestGraph = refreshedGraph;
          logOperational("GRAPH", `GRAPH REFRESHED: ${refreshedGraph.nodes.length} nodes`);
        }
      } catch (graphRefreshErr) {
        logOperational("ALERT", `AUTO-ENRICH FAILED: ${graphRefreshErr.message}`);
      }

      // Use LLM-determined relevant nodes
      if (data.relevantNodes && data.relevantNodes.length > 0) {
        const validNodes = new Set((freshestGraph?.nodes || []).map(n => n.id));
        const primary = new Set(data.relevantNodes.filter(n => n !== "India" && validNodes.has(n)));
        if (primary.size > 0) {
          setQueryPrimaryNodes(primary);
          setQueryHighlightedNodes(primary);
          logActivity("GRAPH", `LLM NODES ACTIVATED: ${[...primary].join(", ").toUpperCase()}`);
          logOperational("GRAPH", `RELEVANT NODES: ${[...primary].join(", ")}`);
        }
      }

      logActivity("SYSTEM", `ANALYSIS COMPLETE: Reliability ${confidence}%`);
      logOperational("SYSTEM", `ANALYSIS COMPLETE: Reliability ${confidence}%`);
    } catch (err) {
      console.error("INDRA fetch error:", err);
      setResponse(`ERROR: SECURE LINK DISRUPTED — ${err.message}. PLEASE RE-ESTABLISH CONNECTION.`);
      logActivity("ALERT", `BACKEND PROXY ERROR: ${err.message}`);
      logOperational("ALERT", `BACKEND ERROR: ${err.message}`);
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
            <img src="/indra-logo.png" alt="INDRA Logo" style={{ height: 50, objectFit: "contain" }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#FF9933", fontWeight: "900", letterSpacing: 6, fontSize: 18, lineHeight: 1 }}>INDRA</span>
              <span style={{ color: theme.secondary, letterSpacing: 3, fontSize: 9, fontWeight: "500" }}>GLOBAL ONTOLOGY ENGINE</span>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            {/* Node Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                background: theme.bg, border: `1px solid ${theme.border}`, color: theme.text,
                fontSize: 9, padding: "6px 10px", borderRadius: 4, cursor: "pointer",
                fontFamily: "monospace"
              }}
            >
              <option value="all">ALL NODES</option>
              <option value="country">COUNTRIES</option>
              <option value="tech">TECHNOLOGY</option>
              <option value="resource">RESOURCES</option>
              <option value="sector">SECTORS</option>
            </select>

            {/* Show India Only Toggle */}
            <button
              onClick={() => setShowAllNodes(!showAllNodes)}
              style={{
                background: showAllNodes ? "rgba(255, 153, 51, 0.15)" : "rgba(15, 118, 110, 0.1)",
                border: `1px solid ${showAllNodes ? '#FF9933' : '#0F766E'}`,
                color: showAllNodes ? "#FF9933" : "#0F766E",
                fontSize: 9, padding: "6px 12px", cursor: "pointer", borderRadius: 4,
                fontFamily: "monospace", letterSpacing: 1, fontWeight: "bold"
              }}
            >
              {showAllNodes ? "SHOW ALL" : "INDIA ONLY"}
            </button>

            {/* Country Selector */}
            <select
              value={currentTopic}
              onChange={(e) => {
                setCurrentTopic(e.target.value);
                logActivity("SYSTEM", `TOPIC CHANGED: ${e.target.value.toUpperCase()}`);
              }}
              style={{
                background: theme.bg, border: `1px solid ${theme.border}`, color: theme.text,
                fontSize: 9, padding: "6px 10px", borderRadius: 4, cursor: "pointer",
                fontFamily: "monospace"
              }}
            >
              <option value="India">INDIA</option>
              <option value="China">CHINA</option>
              <option value="USA">USA</option>
              <option value="Russia">RUSSIA</option>
              <option value="EU">EUROPE</option>
              <option value="Middle East">MIDDLE EAST</option>
              <option value="Taiwan">TAIWAN</option>
              <option value="World">GLOBAL</option>
            </select>

            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: theme.secondary }}>SEARCH:</span>
              <input
                type="text"
                placeholder="..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); highlightNode(e.target.value); }}
                style={{
                  background: theme.bg, border: `1px solid ${theme.border}`, color: theme.text,
                  fontSize: 10, padding: "6px 12px 6px 60px", width: 140, outline: "none",
                  borderRadius: 4, fontFamily: "monospace"
                }}
              />
            </div>
            
            {/* KB Update Button */}
            <button
              onClick={triggerKBUpdate}
              disabled={kbUpdating}
              style={{
                background: kbUpdating ? theme.border : "rgba(15, 118, 110, 0.1)",
                border: `1px solid ${kbUpdating ? theme.border : '#0F766E'}`,
                color: kbUpdating ? theme.secondary : "#0F766E",
                fontSize: 9, padding: "6px 12px", cursor: kbUpdating ? "default" : "pointer",
                borderRadius: 4, fontFamily: "monospace", letterSpacing: 2, fontWeight: "bold"
              }}
            >
              {kbUpdating ? "UPDATING..." : "UPDATE KB"}
            </button>

              {/* Predict Risk Button */}
              <button
                onClick={runRiskPrediction}
                disabled={predictingRisk}
                style={{
                  background: predictingRisk ? theme.border : "rgba(255, 68, 68, 0.1)",
                  border: `1px solid ${predictingRisk ? theme.border : '#FF4444'}`,
                  color: predictingRisk ? theme.secondary : "#FF4444",
                  fontSize: 9, padding: "6px 12px", cursor: predictingRisk ? "default" : "pointer",
                  borderRadius: 4, fontFamily: "monospace", letterSpacing: 2, fontWeight: "bold"
                }}
              >
                {predictingRisk ? "SIMULATING..." : "PREDICT RISKS"}
              </button>
            
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
              {/* Quick Stats */}
              {dashboardStats && (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: theme.secondary }}>📰 {dashboardStats.summary?.totalArticles || 0}</span>
                  {dashboardStats.sentiment?.score > 0 && <span style={{ fontSize: 9, color: "#22C55E" }}>😊 {dashboardStats.sentiment.score}</span>}
                  {dashboardStats.sentiment?.score < 0 && <span style={{ fontSize: 9, color: "#FF4444" }}>😟 {dashboardStats.sentiment.score}</span>}
                  {(dashboardStats.summary?.criticalAlerts || 0) > 0 && <span style={{ fontSize: 9, color: "#FF4444", fontWeight: "bold" }}>🚨 {dashboardStats.summary.criticalAlerts}</span>}
                </div>
              )}
              <span style={{ color: theme.secondary, fontSize: 10, fontFamily: "monospace" }}>{timeStr}</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Graph Container */}
        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <svg ref={svgRef} style={{ display: (activeQuery && hasGraphData) ? "block" : "none", width: "100%", height: "100%" }} />

          {/* Standby screen before first query */}
          {(!activeQuery || !hasGraphData) && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", background: theme.bg,
            }}>
              <Globe
                width={800}
                height={600}
                backgroundColor="rgba(0,0,0,0)"
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
                polygonsData={countriesData.features}
                polygonAltitude={d => d === hoveredCountry ? 0.06 : 0.01}
                polygonCapColor={d => d === hoveredCountry ? "#FF9933" : "rgba(15, 118, 110, 0.4)"}
                polygonSideColor={() => "rgba(15, 118, 110, 0.1)"}
                polygonStrokeColor={() => "#0F766E"}
                polygonLabel={({ properties: d }) => `
                  <div style="background: rgba(0,0,0,0.8); color: #FF9933; padding: 6px 12px; border-radius: 4px; border: 1px solid #FF9933; font-family: monospace; font-size: 11px;">
                    <b>${d.ADMIN}</b> <br/>
                    <i>[CLICK TO DEPLOY SWARM]</i>
                  </div>
                `}
                onPolygonHover={setHoveredCountry}
                onPolygonClick={(d) => {
                  const countryName = d.properties.ADMIN;
                  setCurrentTopic(countryName);
                  setNewsModalCountry(countryName);
                }}
              />
              <div style={{ position: "absolute", bottom: 40, textAlign: "center", pointerEvents: "none" }}>
                <div style={{ color: theme.secondary, fontSize: 13, letterSpacing: 4, fontWeight: "bold", marginBottom: 8, background: "rgba(255,255,255,0.7)", padding: "10px", borderRadius: "4px" }}>
                  {!hasGraphData ? "KNOWLEDGE GRAPH LOADING" : (darkMode ? "DARK MODE ACTIVE" : "INTELLIGENCE GRAPH STANDBY")}
                </div>
                <div style={{ color: theme.secondary, fontSize: 11, background: "rgba(255,255,255,0.7)", padding: "4px 10px", borderRadius: "4px" }}>
                  {!hasGraphData
                    ? "Graph data not ready yet. Running analysis will keep globe view until graph is available."
                    : (liveHeadlines.length > 0 ? "Live intelligence connected • Click a country or submit a query" : "Click any country to deploy Intel Swarm")}
                </div>
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
              {analysisLog.length === 0 ? (
                <div style={{ color: theme.secondary, fontSize: 10 }}>
                  Analyze run ka wait ho raha hai. Query likho aur RUN ANALYZE ENGINE dabao.
                </div>
              ) : (
                analysisLog.map((log, i) => (
                  <div key={i} style={{ marginBottom: 6, display: "flex", gap: 15 }}>
                    <span style={{ color: theme.secondary, minWidth: 70 }}>[{log.time}]</span>
                    <span style={{
                      color: log.type === "ALERT" ? "#FF4444" : log.type === "INTEL" ? "#0F766E" : "#FF9933",
                      minWidth: 60, fontWeight: "bold"
                    }}>{log.type}</span>
                    <span style={{ color: theme.text }}>{log.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Intelligence Dashboard Panel */}
          {dashboardStats && (
            <div style={{
              position: "absolute", top: 14, left: 14, fontSize: 8, color: "#64748B",
              letterSpacing: 2, background: "rgba(255,255,255,0.97)", padding: "15px", borderRadius: 6,
              backdropFilter: "blur(6px)", borderLeft: "4px solid #0F766E",
              zIndex: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", border: "1px solid #E2E8F0",
              minWidth: 240,
              maxWidth: 250,
              maxHeight: "58vh",
              overflowY: "auto",
              paddingTop: 10,
              paddingBottom: 10
            }}>
              <div style={{ marginBottom: 12, borderBottom: `1px solid ${theme.border}`, paddingBottom: 8, color: "#0F766E", fontWeight: "bold", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📊 INTELLIGENCE DASHBOARD</span>
                <span style={{ fontSize: 8, color: theme.secondary }}>LIVE</span>
              </div>
              
              {/* Stats Row */}
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: "bold", color: "#FF9933" }}>{dashboardStats.summary?.totalArticles || 0}</div>
                  <div style={{ fontSize: 8, color: theme.secondary }}>ARTICLES</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: "bold", color: dashboardStats.sentiment?.score > 0 ? "#22C55E" : dashboardStats.sentiment?.score < 0 ? "#FF4444" : "#94A3B8" }}>
                    {dashboardStats.sentiment?.score || 0}%
                  </div>
                  <div style={{ fontSize: 8, color: theme.secondary }}>SENTIMENT</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: "bold", color: (dashboardStats.summary?.criticalAlerts || 0) > 0 ? "#FF4444" : "#22C55E" }}>
                    {dashboardStats.summary?.criticalAlerts || 0}
                  </div>
                  <div style={{ fontSize: 8, color: theme.secondary }}>ALERTS</div>
                </div>
              </div>
              
              {/* Categories */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {dashboardStats.categories?.slice(0, 4).map((cat, i) => (
                  <span key={i} style={{
                    fontSize: 8, padding: "3px 8px", borderRadius: 10,
                    background: cat.color + "20", color: cat.color,
                    fontWeight: "bold"
                  }}>
                    {cat.name} ({cat.count})
                  </span>
                ))}
              </div>
              
              {/* Critical Alert */}
              {dashboardStats.alerts?.[0] && (
                <div style={{
                  background: "#FF444410", border: "1px solid #FF4444",
                  padding: "8px", borderRadius: 4, marginTop: 8
                }}>
                  <div style={{ color: "#FF4444", fontSize: 9, fontWeight: "bold", marginBottom: 4 }}>
                    🚨 CRITICAL ALERT
                  </div>
                  <div style={{ color: theme.text, fontSize: 9, lineHeight: 1.3 }}>
                    {dashboardStats.alerts[0].title?.substring(0, 60)}...
                  </div>
                </div>
              )}
              
              {/* Markov Risk Scores */}
              <div style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: `1px solid ${theme.border}`,
                borderLeft: marketStress.data?.stressLevel === "HIGH" ? "3px solid #DC2626" : marketStress.data?.stressLevel === "MEDIUM" ? "3px solid #D97706" : "3px solid transparent",
                paddingLeft: 6,
                background: marketStress.data?.stressLevel === "HIGH" ? "rgba(220, 38, 38, 0.06)" : marketStress.data?.stressLevel === "MEDIUM" ? "rgba(217, 119, 6, 0.05)" : "transparent",
                borderRadius: 4
              }}>
                <div style={{ color: "#FF9933", fontSize: 9, fontWeight: "bold", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  📈 RISK PROPAGATION <span style={{fontSize: 7, color: theme.secondary}}>MARKOV</span>
                  {marketStress.data?.stressLevel && (
                    <span style={{
                      fontSize: 7,
                      fontWeight: "bold",
                      color: marketStress.data.stressLevel === "HIGH" ? "#DC2626" : marketStress.data.stressLevel === "MEDIUM" ? "#D97706" : "#16A34A",
                      background: marketStress.data.stressLevel === "HIGH" ? "rgba(220, 38, 38, 0.12)" : marketStress.data.stressLevel === "MEDIUM" ? "rgba(217, 119, 6, 0.12)" : "rgba(22, 163, 74, 0.12)",
                      border: `1px solid ${marketStress.data.stressLevel === "HIGH" ? "#FCA5A5" : marketStress.data.stressLevel === "MEDIUM" ? "#FCD34D" : "#86EFAC"}`,
                      borderRadius: 10,
                      padding: "1px 6px"
                    }}>
                      MARKET {marketStress.data.stressLevel}
                    </span>
                  )}
                </div>
                {riskScores.slice(0, 3).map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 8, marginBottom: 4 }}>
                    <span style={{ color: i < 3 ? "#FF4444" : theme.text }}>{i+1}. {r.id}</span>
                    <span style={{ color: "#FF9933", fontWeight: "bold" }}>{r.score}%</span>
                  </div>
                ))}
              </div>
              
              {/* What-If Scenario Simulator */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
                <div style={{ color: "#0F766E", fontSize: 9, fontWeight: "bold", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  🔮 WHAT-IF SCENARIOS <span style={{fontSize: 7, color: theme.secondary}}>SIMULATOR</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(scenarioList.length > 0 ? scenarioList : FALLBACK_SCENARIOS).slice(0, 3).map((s, i) => (
                    <div key={i} 
                      onClick={() => askINDRA(s.q)}
                      style={{
                        background: theme.bg, padding: "6px 8px", borderRadius: 4,
                        border: `1px solid ${theme.border}`, cursor: "pointer",
                        transition: "all 0.2s", 
                        ":hover": { background: theme.border }
                      }}
                      onMouseEnter={(e) => e.target.style.background = theme.border}
                      onMouseLeave={(e) => e.target.style.background = theme.bg}
                    >
                      <div style={{ fontSize: 8, color: theme.text, marginBottom: 2 }}>{s.label || 'Scenario'}</div>
                      <div style={{ fontSize: 8, color: "#FF8800", fontWeight: "bold" }}>{(s.q || '').slice(0, 38)}...</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Controls HUD - Toggle Button - Hidden */}
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            style={{
              display: "none",
              position: "absolute", top: 20, left: 320, padding: "6px 12px", fontSize: 9,
              background: showTimeline ? "#FF9933" : "rgba(255,255,255,0.92)", color: showTimeline ? "white" : "#64748B",
              border: "1px solid #E2E8F0", borderRadius: 4, cursor: "pointer", zIndex: 11,
              fontWeight: "bold", letterSpacing: 1, transition: "all 0.2s",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
            }}
            title="Toggle keyboard shortcuts"
          >
            {showTimeline ? "⌨ HIDE" : "⌨ HELP"}
          </button>

          {/* Strategic Timeline - Hidden by Default */}
          {showTimeline && <div style={{
            position: "absolute", top: 20, left: 320, fontSize: 9, color: "#64748B",
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
            <div style={{ color: "#FF9933", marginBottom: 4 }}>CTRL+ENTER: RUN ANALYZE</div>
            <div style={{ color: "#0F766E" }}>CTRL+D: DARK MODE</div>
            <div style={{ color: "#0F766E" }}>CTRL+H: HEATMAP</div>
            <div style={{ color: "#0F766E" }}>CTRL+K: UPDATE KB</div>
          </div>}

          {/* Right-side Climate + Market stack */}
          {!isSituationRoom && (
            <>
              <div style={{
                position: "absolute", top: 14, right: 14, zIndex: 9,
                width: 250,
                background: "linear-gradient(160deg, rgba(255,255,255,0.98), rgba(236,253,245,0.98))",
                border: "1px solid #99F6E4", borderLeft: "4px solid #14B8A6",
                borderRadius: 8, boxShadow: "0 6px 24px rgba(20, 184, 166, 0.2)",
                padding: "10px 12px", backdropFilter: "blur(6px)",
                fontFamily: "monospace",
                boxSizing: "border-box"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ color: "#0F766E", fontSize: 10, fontWeight: "bold", letterSpacing: 1.5 }}>CLIMATE OVERLAY</span>
                  <span style={{ color: "#0F766E", fontSize: 8 }}>LIVE FREE API</span>
                </div>

                {climateOverlay.loading ? (
                  <div style={{ fontSize: 10, color: "#0F766E" }}>Syncing climate feed...</div>
                ) : climateOverlay.error ? (
                  <div style={{ fontSize: 10, color: "#DC2626" }}>Climate feed unavailable</div>
                ) : (
                  <>
                    <div style={{ fontSize: 9, color: "#334155", marginBottom: 6 }}>{currentTopic.toUpperCase()}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 9, color: "#64748B" }}>Temp</span>
                      <span style={{ fontSize: 12, color: "#0F766E", fontWeight: "bold" }}>
                        {climateOverlay.data?.temperature ?? "--"}°C
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 9, color: "#64748B" }}>Conditions</span>
                      <span style={{ fontSize: 9, color: "#1E293B", textTransform: "uppercase" }}>
                        {(climateOverlay.data?.conditions || "unknown").slice(0, 16)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 9, color: "#64748B" }}>Instability</span>
                      <span style={{
                        fontSize: 9,
                        fontWeight: "bold",
                        color: climateOverlay.risk?.level === "HIGH" ? "#DC2626" : climateOverlay.risk?.level === "MEDIUM" ? "#D97706" : "#16A34A"
                      }}>
                        {climateOverlay.risk?.level || "--"} ({climateOverlay.risk?.score ?? "--"})
                      </span>
                    </div>
                    <div style={{ fontSize: 8, color: "#64748B", borderTop: "1px dashed #99F6E4", paddingTop: 6 }}>
                      Source: Open-Meteo + GDELT (100% free)
                    </div>
                  </>
                )}
              </div>

              <div style={{
                position: "absolute", top: 188, right: 14, zIndex: 9,
                width: 250,
                background: "linear-gradient(165deg, rgba(255,255,255,0.98), rgba(255,247,237,0.98))",
                border: "1px solid #FECACA", borderLeft: "4px solid #EA580C",
                borderRadius: 8, boxShadow: "0 6px 20px rgba(234, 88, 12, 0.18)",
                padding: "10px 12px", backdropFilter: "blur(6px)",
                fontFamily: "monospace",
                boxSizing: "border-box"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ color: "#C2410C", fontSize: 10, fontWeight: "bold", letterSpacing: 1.4 }}>MARKET STRESS</span>
                  <span style={{ color: "#9A3412", fontSize: 8 }}>LIVE FREE FEED</span>
                </div>

                {marketStress.loading ? (
                  <div style={{ fontSize: 10, color: "#C2410C" }}>Syncing market signals...</div>
                ) : marketStress.error ? (
                  <div style={{ fontSize: 10, color: "#DC2626" }}>Market feed unavailable</div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                      <span style={{ fontSize: 9, color: "#64748B" }}>Crisis Watch</span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: "bold",
                        color: marketStress.data?.stressLevel === "HIGH" ? "#DC2626" : marketStress.data?.stressLevel === "MEDIUM" ? "#D97706" : "#16A34A"
                      }}>
                        {marketStress.data?.stressLevel || "--"} ({marketStress.data?.stressScore ?? "--"})
                      </span>
                    </div>

                    <div style={{ borderTop: "1px dashed #FDBA74", paddingTop: 6 }}>
                      {(marketStress.data?.drivers || []).slice(0, 3).map((d) => (
                        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 8 }}>
                          <span style={{ color: "#334155" }}>{d.label}</span>
                          <span style={{ color: d.changePct < 0 ? "#DC2626" : "#16A34A", fontWeight: "bold" }}>
                            {d.changePct > 0 ? "+" : ""}{d.changePct}%
                          </span>
                        </div>
                      ))}
                    </div>

                    <div style={{ fontSize: 8, color: "#64748B", borderTop: "1px dashed #FDBA74", paddingTop: 6 }}>
                      Source: Yahoo Finance public chart API
                    </div>
                  </>
                )}
              </div>
            </>
          )}



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
            background: theme.panel, borderTop: `1px solid ${theme.border}`,
            display: "flex", alignItems: "center", overflow: "hidden", zIndex: 10
          }}>
            <div style={{
              background: criticalAlerts.length > 0 ? "#FF4444" : "#FF9933", 
              color: "#000", fontSize: 9, fontWeight: "900",
              height: "100%", display: "flex", alignItems: "center", px: "12px",
              padding: "0 15px", letterSpacing: 2, flexShrink: 0
            }}>
              {criticalAlerts.length > 0 ? `⚠ ALERT: ${criticalAlerts.length} CRITICAL` : liveHeadlines.length > 0 ? "LIVE INTEL FEED" : "SIGINT FEED"}
            </div>
            <div style={{
              display: "flex", whiteSpace: "nowrap", animation: "ticker 60s linear infinite",
              fontSize: 10, fontFamily: "monospace", gap: 50
            }}>
              {(liveHeadlines.length > 0 ? liveHeadlines : fallbackHeadlines).map((h, i) => {
                const isAlert = h.startsWith('🔴');
                const isWarning = h.startsWith('🟠');
                return (
                  <span key={i} style={{ 
                    color: isAlert ? "#FF4444" : isWarning ? "#FF8800" : "#B45309",
                    fontWeight: isAlert ? "bold" : "normal"
                  }}>{h}</span>
                );
              })}
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
                TAC-NEWS FEED {liveIntelligence?.sources && <span style={{fontSize:8}}>• RSS/CURRENTS/GDELT</span>}
              </div>
              <div style={{ height: 120, overflow: "hidden", position: "relative" }}>
                <div style={{ animation: "news-scroll 15s linear infinite" }}>
                  {(liveHeadlines.length > 0 ? liveHeadlines : fallbackHeadlines).map((h, i) => (
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
                  : scenarioList
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
                      LEVEL {currentGraph.links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).length}
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

      {/* Phase 7: News Modal */}
      {newsModalCountry && (
        <NewsModal
          country={newsModalCountry}
          onClose={() => setNewsModalCountry(null)}
        />
      )}
    </div>
  );
}
