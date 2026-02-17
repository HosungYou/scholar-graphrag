"""
Centrality Analyzer

NetworkX-based centrality analysis for knowledge graphs.
Provides methods for computing various centrality metrics and graph slicing.
"""

import logging
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from collections import OrderedDict

import networkx as nx
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

logger = logging.getLogger(__name__)


@dataclass
class CentralityMetrics:
    """Container for all centrality metrics."""
    betweenness: Dict[str, float]
    degree: Dict[str, float]
    eigenvector: Dict[str, float]
    pagerank: Dict[str, float]


@dataclass
class ClusterResult:
    """Container for clustering results."""
    cluster_id: int
    node_ids: List[str]
    node_names: List[str]
    centroid: Optional[List[float]]
    size: int
    label: Optional[str] = None


class CentralityAnalyzer:
    """
    Analyzer for computing centrality metrics and performing graph operations.

    Supports:
    - Betweenness centrality (bridge nodes)
    - Degree centrality (hub nodes)
    - Eigenvector centrality (influential nodes)
    - PageRank (importance)
    - Node slicing (removing top-N nodes)
    - K-means clustering
    """

    CACHE_MAX_ENTRIES = 20

    def __init__(self):
        # Bound cache size to prevent unbounded memory growth across many projects.
        self._cache: "OrderedDict[str, CentralityMetrics]" = OrderedDict()

    def build_graph(
        self,
        nodes: List[dict],
        edges: List[dict]
    ) -> nx.Graph:
        """
        Build a NetworkX graph from nodes and edges.

        Args:
            nodes: List of node dictionaries with 'id' and optional 'properties'
            edges: List of edge dictionaries with 'source', 'target', and optional 'weight'

        Returns:
            NetworkX Graph
        """
        G = nx.Graph()

        for node in nodes:
            node_id = node.get('id')
            properties = node.get('properties', {})
            name = node.get('name', node_id)
            entity_type = node.get('entity_type', 'Unknown')
            G.add_node(
                node_id,
                name=name,
                entity_type=entity_type,
                **properties
            )

        for edge in edges:
            source = edge.get('source')
            target = edge.get('target')
            weight = edge.get('weight', 1.0)
            if source and target and G.has_node(source) and G.has_node(target):
                G.add_edge(source, target, weight=float(weight))

        return G

    def compute_all_centrality(
        self,
        nodes: List[dict],
        edges: List[dict],
        cache_key: Optional[str] = None
    ) -> CentralityMetrics:
        """
        Compute all centrality metrics for the graph.

        Args:
            nodes: List of node dictionaries
            edges: List of edge dictionaries
            cache_key: Optional key for caching results

        Returns:
            CentralityMetrics with all computed metrics
        """
        if cache_key and cache_key in self._cache:
            metrics = self._cache[cache_key]
            self._cache.move_to_end(cache_key)
            return metrics

        G = self.build_graph(nodes, edges)

        if G.number_of_nodes() == 0:
            empty_result = CentralityMetrics(
                betweenness={},
                degree={},
                eigenvector={},
                pagerank={}
            )
            return empty_result

        # Compute betweenness centrality
        try:
            betweenness = nx.betweenness_centrality(G, weight='weight')
        except Exception as e:
            logger.warning(f"Failed to compute betweenness centrality: {e}")
            betweenness = {n: 0.0 for n in G.nodes()}

        # Compute degree centrality
        try:
            degree = dict(G.degree())
            max_degree = max(degree.values()) if degree else 1
            degree = {k: v / max_degree for k, v in degree.items()}
        except Exception as e:
            logger.warning(f"Failed to compute degree centrality: {e}")
            degree = {n: 0.0 for n in G.nodes()}

        # Compute eigenvector centrality
        try:
            eigenvector = nx.eigenvector_centrality(
                G,
                max_iter=100,
                weight='weight'
            )
        except Exception as e:
            logger.warning(f"Failed to compute eigenvector centrality, falling back to degree: {e}")
            # Fallback to degree centrality instead of all zeros
            eigenvector = degree.copy()

        # Compute PageRank
        try:
            pagerank = nx.pagerank(G, weight='weight')
        except Exception as e:
            logger.warning(f"Failed to compute PageRank: {e}")
            pagerank = {n: 0.0 for n in G.nodes()}

        metrics = CentralityMetrics(
            betweenness=betweenness,
            degree=degree,
            eigenvector=eigenvector,
            pagerank=pagerank
        )

        if cache_key:
            if cache_key in self._cache:
                self._cache.move_to_end(cache_key)
            self._cache[cache_key] = metrics
            while len(self._cache) > self.CACHE_MAX_ENTRIES:
                self._cache.popitem(last=False)

        return metrics

    def get_top_bridges(
        self,
        centrality: Dict[str, float],
        top_n: int = 10
    ) -> List[Tuple[str, float]]:
        """
        Get the top N nodes by centrality score.

        Args:
            centrality: Dictionary mapping node IDs to scores
            top_n: Number of top nodes to return

        Returns:
            List of (node_id, score) tuples sorted by score descending
        """
        sorted_nodes = sorted(
            centrality.items(),
            key=lambda x: x[1],
            reverse=True
        )
        return sorted_nodes[:top_n]

    def slice_graph(
        self,
        nodes: List[dict],
        edges: List[dict],
        remove_top_n: int,
        metric: str = 'betweenness'
    ) -> Tuple[List[dict], List[dict], List[str], List[Tuple[str, float]]]:
        """
        Remove the top N nodes by centrality metric.

        This reveals hidden cluster structures by removing bridge nodes.

        Args:
            nodes: Original list of node dictionaries
            edges: Original list of edge dictionaries
            remove_top_n: Number of top nodes to remove
            metric: Centrality metric to use ('betweenness', 'degree', 'eigenvector')

        Returns:
            Tuple of (filtered_nodes, filtered_edges, removed_ids, top_bridges)
        """
        metrics = self.compute_all_centrality(nodes, edges)

        if metric == 'betweenness':
            centrality = metrics.betweenness
        elif metric == 'degree':
            centrality = metrics.degree
        elif metric == 'eigenvector':
            centrality = metrics.eigenvector
        else:
            centrality = metrics.betweenness

        top_bridges = self.get_top_bridges(centrality, remove_top_n)
        top_ids = {node_id for node_id, _ in top_bridges}

        # Filter out top nodes
        filtered_nodes = [n for n in nodes if n.get('id') not in top_ids]

        # Filter edges that connect to removed nodes
        filtered_edges = [
            e for e in edges
            if e.get('source') not in top_ids and e.get('target') not in top_ids
        ]

        return filtered_nodes, filtered_edges, list(top_ids), top_bridges

    def compute_optimal_k(
        self,
        embeddings: np.ndarray,
        min_k: int = 2,
        max_k: int = 10
    ) -> int:
        """
        Find the optimal number of clusters using silhouette score.

        Args:
            embeddings: Node embeddings as numpy array
            min_k: Minimum number of clusters to try
            max_k: Maximum number of clusters to try

        Returns:
            Optimal number of clusters
        """
        if len(embeddings) < min_k:
            return min_k

        max_k = min(max_k, len(embeddings) - 1)

        best_k = min_k
        best_score = -1

        for k in range(min_k, max_k + 1):
            try:
                kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                labels = kmeans.fit_predict(embeddings)
                score = silhouette_score(embeddings, labels)

                if score > best_score:
                    best_score = score
                    best_k = k
            except Exception as e:
                logger.warning(f"Failed to compute silhouette for k={k}: {e}")
                continue

        return best_k

    def cluster_nodes(
        self,
        nodes: List[dict],
        embeddings: Optional[np.ndarray] = None,
        n_clusters: int = 5
    ) -> List[ClusterResult]:
        """
        Cluster nodes using K-means.

        Args:
            nodes: List of node dictionaries
            embeddings: Optional pre-computed embeddings
            n_clusters: Number of clusters

        Returns:
            List of ClusterResult objects
        """
        if embeddings is None:
            # If no embeddings, use graph-based features
            G = nx.Graph()
            for node in nodes:
                G.add_node(node.get('id'))

            # Use spectral embedding as fallback
            if G.number_of_nodes() < n_clusters:
                return []

            try:
                embeddings = nx.spectral_layout(G)
                embeddings = np.array([embeddings[n] for n in G.nodes()])
            except Exception:
                return []

        if len(embeddings) < n_clusters:
            n_clusters = max(2, len(embeddings) // 2)

        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(embeddings)

        # Group nodes by cluster
        clusters_dict: Dict[int, List[dict]] = {}
        for node, label in zip(nodes, labels):
            if label not in clusters_dict:
                clusters_dict[label] = []
            clusters_dict[label].append(node)

        results = []
        for cluster_id, cluster_nodes in clusters_dict.items():
            results.append(ClusterResult(
                cluster_id=int(cluster_id),
                node_ids=[n.get('id') for n in cluster_nodes],
                node_names=[n.get('name', n.get('id')) for n in cluster_nodes],
                centroid=kmeans.cluster_centers_[cluster_id].tolist() if hasattr(kmeans, 'cluster_centers_') else None,
                size=len(cluster_nodes),
                label=None  # Can be set later using LLM
            ))

        return results

    def get_node_name(
        self,
        node_id: str,
        nodes: List[dict]
    ) -> str:
        """Get node name by ID."""
        for node in nodes:
            if node.get('id') == node_id:
                return node.get('name', node_id)
        return node_id

    def clear_cache(self, cache_key: Optional[str] = None):
        """Clear the centrality cache."""
        if cache_key:
            self._cache.pop(cache_key, None)
        else:
            self._cache.clear()

    def compute_graph_metrics(
        self,
        nodes: List[dict],
        edges: List[dict],
        clusters: Optional[List[ClusterResult]] = None
    ) -> Dict[str, float]:
        """
        Compute graph quality metrics for Insight HUD (InfraNodus-style).

        Args:
            nodes: List of node dictionaries
            edges: List of edge dictionaries
            clusters: Optional list of ClusterResult objects

        Returns:
            Dictionary with modularity, diversity, and density metrics
        """
        G = self.build_graph(nodes, edges)

        if G.number_of_nodes() == 0:
            return {
                "modularity": 0.0,
                "diversity": 0.0,
                "density": 0.0,
                "avg_clustering": 0.0,
                "num_components": 0,
            }

        # 1. Modularity: cluster separation quality (0-1)
        modularity = 0.0
        modularity_raw = 0.0
        if clusters and len(clusters) > 1:
            try:
                # Convert clusters to community format for NetworkX
                communities = [set(c.node_ids) for c in clusters]
                # Filter to only include nodes that exist in the graph
                communities = [
                    c.intersection(set(G.nodes()))
                    for c in communities
                ]
                communities = [c for c in communities if len(c) > 0]

                if len(communities) > 1:
                    modularity = nx.algorithms.community.quality.modularity(
                        G, communities
                    )
                    modularity_raw = modularity
                    # Normalize to 0-1 range for backward compatibility
                    modularity = max(0.0, min(1.0, (modularity + 0.5) / 1.5))
            except Exception as e:
                logger.warning(f"Failed to compute modularity: {e}")

        # 2. Diversity: cluster size balance (0-1)
        # Uses normalized entropy of cluster sizes
        diversity = 0.0
        if clusters and len(clusters) > 1:
            try:
                sizes = [c.size for c in clusters]
                total = sum(sizes)
                if total > 0:
                    # Calculate normalized entropy
                    probs = [s / total for s in sizes]
                    entropy = -sum(p * np.log(p + 1e-10) for p in probs if p > 0)
                    max_entropy = np.log(len(clusters))  # Maximum entropy for uniform distribution
                    diversity = entropy / max_entropy if max_entropy > 0 else 0.0
            except Exception as e:
                logger.warning(f"Failed to compute diversity: {e}")

        # 3. Density: connection density (0-1)
        try:
            density = nx.density(G)
        except Exception as e:
            logger.warning(f"Failed to compute density: {e}")
            density = 0.0

        # 4. Average clustering coefficient
        try:
            avg_clustering = nx.average_clustering(G)
        except Exception as e:
            logger.warning(f"Failed to compute clustering coefficient: {e}")
            avg_clustering = 0.0

        # 5. Number of connected components
        try:
            num_components = nx.number_connected_components(G)
        except Exception as e:
            logger.warning(f"Failed to compute connected components: {e}")
            num_components = 1

        return {
            "modularity": round(modularity, 3),
            "modularity_raw": round(modularity_raw, 4),
            "diversity": round(diversity, 3),
            "density": round(density, 3),
            "avg_clustering": round(avg_clustering, 3),
            "num_components": num_components,
        }


    def compute_cluster_quality(
        self,
        nodes: List[dict],
        edges: List[dict],
        clusters: Optional[List[ClusterResult]] = None,
        embeddings_map: Optional[Dict[str, List[float]]] = None,
    ) -> Dict[str, float]:
        """
        Compute cluster quality metrics for v0.30.0.

        Args:
            nodes: List of node dictionaries
            edges: List of edge dictionaries
            clusters: Optional list of ClusterResult objects
            embeddings_map: Optional dict mapping node_id to embedding vector

        Returns:
            Dict with modularity_raw, silhouette_score, avg_cluster_coherence, cluster_coverage
        """
        G = self.build_graph(nodes, edges)

        result = {
            "modularity_raw": 0.0,
            "modularity_interpretation": "없음",
            "silhouette_score": 0.0,
            "avg_cluster_coherence": 0.0,
            "cluster_coverage": 0.0,
            "num_communities": 0,
        }

        if G.number_of_nodes() == 0 or not clusters or len(clusters) < 2:
            return result

        result["num_communities"] = len(clusters)

        # 1. Raw modularity
        try:
            communities = [set(c.node_ids) for c in clusters]
            communities = [c.intersection(set(G.nodes())) for c in communities]
            communities = [c for c in communities if len(c) > 0]

            if len(communities) > 1:
                raw_mod = nx.algorithms.community.quality.modularity(G, communities)
                result["modularity_raw"] = round(raw_mod, 4)

                # Interpretation
                if raw_mod >= 0.5:
                    result["modularity_interpretation"] = "강함"
                elif raw_mod >= 0.3:
                    result["modularity_interpretation"] = "보통"
                else:
                    result["modularity_interpretation"] = "약함"
        except Exception as e:
            logger.warning(f"Failed to compute raw modularity: {e}")

        # 2. Silhouette score (graph-distance based)
        try:
            # Build node-to-cluster label mapping
            node_labels = {}
            for cluster in clusters:
                for node_id in cluster.node_ids:
                    if node_id in G.nodes():
                        node_labels[node_id] = cluster.cluster_id

            labeled_nodes = [n for n in G.nodes() if n in node_labels]

            if len(labeled_nodes) >= 4 and len(set(node_labels[n] for n in labeled_nodes)) >= 2:
                # Use shortest path distances as distance matrix
                # For efficiency, use embedding cosine distance if available
                if embeddings_map and len(embeddings_map) >= len(labeled_nodes) * 0.5:
                    # Use embedding-based distance
                    valid_nodes = [n for n in labeled_nodes if n in embeddings_map]
                    if len(valid_nodes) >= 4:
                        emb_array = np.array([embeddings_map[n] for n in valid_nodes])
                        labels_array = np.array([node_labels[n] for n in valid_nodes])

                        if len(set(labels_array)) >= 2:
                            score = silhouette_score(emb_array, labels_array, metric='cosine')
                            result["silhouette_score"] = round(float(score), 4)
                else:
                    # Fallback: use adjacency-based features
                    # Create feature matrix from graph structure
                    adj_matrix = nx.to_numpy_array(G, nodelist=labeled_nodes)
                    labels_array = np.array([node_labels[n] for n in labeled_nodes])

                    if len(set(labels_array)) >= 2 and adj_matrix.shape[0] >= 4:
                        score = silhouette_score(adj_matrix, labels_array, metric='euclidean')
                        result["silhouette_score"] = round(float(score), 4)
        except Exception as e:
            logger.warning(f"Failed to compute silhouette score: {e}")

        # 3. Cluster coherence (avg intra-cluster embedding similarity)
        if embeddings_map:
            try:
                coherences = []
                for cluster in clusters:
                    cluster_embs = [
                        embeddings_map[nid] for nid in cluster.node_ids
                        if nid in embeddings_map
                    ]
                    if len(cluster_embs) >= 2:
                        emb_array = np.array(cluster_embs)
                        # Compute pairwise cosine similarities
                        norms = np.linalg.norm(emb_array, axis=1, keepdims=True)
                        norms = np.maximum(norms, 1e-10)
                        normalized = emb_array / norms
                        sim_matrix = normalized @ normalized.T
                        # Average off-diagonal similarities
                        n = len(cluster_embs)
                        total_sim = (sim_matrix.sum() - n) / (n * (n - 1)) if n > 1 else 0
                        coherences.append(total_sim)

                if coherences:
                    result["avg_cluster_coherence"] = round(float(np.mean(coherences)), 4)
            except Exception as e:
                logger.warning(f"Failed to compute cluster coherence: {e}")

        # 4. Cluster coverage
        try:
            all_cluster_nodes = set()
            for cluster in clusters:
                all_cluster_nodes.update(cluster.node_ids)

            graph_nodes = set(str(n) for n in G.nodes())
            covered = all_cluster_nodes.intersection(graph_nodes)
            if graph_nodes:
                result["cluster_coverage"] = round(len(covered) / len(graph_nodes), 4)
        except Exception as e:
            logger.warning(f"Failed to compute cluster coverage: {e}")

        return result


# Singleton instance
centrality_analyzer = CentralityAnalyzer()
