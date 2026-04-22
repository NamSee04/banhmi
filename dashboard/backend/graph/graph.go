package graph

import (
	"sort"

	"github.com/namsee/banhmi/dashboard/models"
)

const (
	defaultThreshold = 0.75
	defaultTopK      = 10
)

// Build constructs a similarity graph from alerts and their neighbor results.
// neighbors maps alert ID → list of (neighborID, score) pairs above threshold.
func Build(alerts []*models.Alert, neighbors map[string][]Neighbor, threshold float64) *models.Graph {
	if threshold == 0 {
		threshold = defaultThreshold
	}

	// Index alerts by ID
	alertByID := make(map[string]*models.Alert, len(alerts))
	for _, a := range alerts {
		alertByID[a.ID] = a
	}

	// Build adjacency for connection count
	connCount := make(map[string]int, len(alerts))
	edgeSet := make(map[string]models.GraphEdge)

	for srcID, nbrs := range neighbors {
		for _, nbr := range nbrs {
			if nbr.Score < threshold {
				continue
			}
			if srcID == nbr.ID {
				continue
			}
			// Deduplicate edges (A-B same as B-A)
			a, b := srcID, nbr.ID
			if a > b {
				a, b = b, a
			}
			key := a + "||" + b
			if existing, ok := edgeSet[key]; !ok || nbr.Score > existing.Similarity {
				edgeSet[key] = models.GraphEdge{
					Source:     a,
					Target:     b,
					Similarity: nbr.Score,
				}
			}
			connCount[srcID]++
			connCount[nbr.ID]++
		}
	}

	edges := make([]models.GraphEdge, 0, len(edgeSet))
	for _, e := range edgeSet {
		edges = append(edges, e)
	}

	// Run Louvain-style community detection (simple greedy modularity)
	clusters, clusterByID := detectCommunities(alertByID, edgeSet)

	// Build nodes
	nodes := make([]models.GraphNode, 0, len(alerts))
	for _, a := range alerts {
		cid := clusterByID[a.ID]
		cname := ""
		if cid < len(clusters) {
			cname = clusters[cid].Name
		}
		nodes = append(nodes, models.GraphNode{
			ID:          a.ID,
			Label:       a.Description,
			Severity:    a.Severity,
			Status:      a.Status,
			Source:      a.Source,
			Host:        a.Host,
			Time:        a.Time,
			Description: a.Description,
			ClusterID:   cid,
			ClusterName: cname,
			Connections: connCount[a.ID],
			Date:        a.Date,
			Value:       a.Value,
		})
	}

	return &models.Graph{
		Nodes:    nodes,
		Edges:    edges,
		Clusters: clusters,
	}
}

// Neighbor is a similar alert with a similarity score
type Neighbor struct {
	ID    string
	Score float64
}

// detectCommunities runs a greedy label propagation to cluster alerts.
// Returns clusters and a map from alert ID to cluster index.
func detectCommunities(alertByID map[string]*models.Alert, edges map[string]models.GraphEdge) ([]models.Cluster, map[string]int) {
	// Build adjacency list
	adj := make(map[string]map[string]float64)
	for _, a := range alertByID {
		adj[a.ID] = make(map[string]float64)
	}
	for _, e := range edges {
		adj[e.Source][e.Target] = e.Similarity
		adj[e.Target][e.Source] = e.Similarity
	}

	// Initialize: each node in its own community
	community := make(map[string]int, len(alertByID))
	i := 0
	for id := range alertByID {
		community[id] = i
		i++
	}

	// Label propagation iterations
	ids := make([]string, 0, len(alertByID))
	for id := range alertByID {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	for iter := 0; iter < 20; iter++ {
		changed := false
		for _, id := range ids {
			// Count neighbor community votes weighted by similarity
			votes := make(map[int]float64)
			for nbr, score := range adj[id] {
				votes[community[nbr]] += score
			}
			if len(votes) == 0 {
				continue
			}
			best := community[id]
			bestScore := 0.0
			for cid, score := range votes {
				if score > bestScore {
					bestScore = score
					best = cid
				}
			}
			if best != community[id] {
				community[id] = best
				changed = true
			}
		}
		if !changed {
			break
		}
	}

	// Re-map community IDs to 0-based sequential integers
	cidMap := make(map[int]int)
	nextCID := 0
	for _, id := range ids {
		old := community[id]
		if _, exists := cidMap[old]; !exists {
			cidMap[old] = nextCID
			nextCID++
		}
		community[id] = cidMap[old]
	}

	// Build cluster objects
	clusterMembers := make(map[int][]string)
	for id, cid := range community {
		clusterMembers[cid] = append(clusterMembers[cid], id)
	}

	clusters := make([]models.Cluster, nextCID)
	for cid, members := range clusterMembers {
		sort.Strings(members)
		// Name will be filled in by LLM labeler; default to dominant source/severity
		name := clusterLabel(members, alertByID)
		clusters[cid] = models.Cluster{
			ID:      cid,
			Name:    name,
			Members: members,
			Size:    len(members),
		}
	}

	return clusters, community
}

// clusterLabel produces a heuristic label from the most common source in the cluster
func clusterLabel(members []string, alertByID map[string]*models.Alert) string {
	srcCount := make(map[string]int)
	sevCount := make(map[string]int)
	for _, id := range members {
		if a, ok := alertByID[id]; ok {
			srcCount[a.Source]++
			sevCount[a.Severity]++
		}
	}
	topSrc := topKey(srcCount)
	topSev := topKey(sevCount)
	if topSrc == "" {
		return "Cluster"
	}
	return topSev + " / " + topSrc
}

func topKey(m map[string]int) string {
	best := ""
	bestCount := 0
	for k, v := range m {
		if v > bestCount {
			bestCount = v
			best = k
		}
	}
	return best
}
