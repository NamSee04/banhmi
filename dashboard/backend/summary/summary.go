package summary

import (
	"sort"
	"strings"

	"github.com/namsee/banhmi/dashboard/models"
)

// Build computes a DaySummary from a list of alerts
func Build(date string, alerts []*models.Alert) *models.DaySummary {
	s := &models.DaySummary{
		Date:     date,
		Total:    len(alerts),
		BySrc:    make(map[string]int),
		ByHost:   make(map[string]int),
		Timeline: make([]models.TimeSlot, 24),
	}

	// Pre-fill 24 hour slots
	for h := 0; h < 24; h++ {
		s.Timeline[h] = models.TimeSlot{Hour: hourLabel(h)}
	}

	for _, a := range alerts {
		switch a.Severity {
		case "critical":
			s.Critical++
		case "warning":
			s.Warning++
		case "info":
			s.Info++
		}
		switch a.Status {
		case "firing":
			s.Firing++
		case "resolved":
			s.Resolved++
		}
		if a.Source != "" {
			s.BySrc[a.Source]++
		}
		if a.Host != "" {
			// Normalise host: strip port
			host := strings.SplitN(a.Host, ":", 2)[0]
			host = strings.TrimSpace(host)
			s.ByHost[host]++
		}
		// Parse hour from Time field (format: "2026-04-17 14:26:40 (UTC+7)")
		if h := parseHour(a.Time); h >= 0 && h < 24 {
			s.Timeline[h].Count++
		}
	}
	return s
}

func hourLabel(h int) string {
	return strings.Join([]string{pad(h), "00"}, ":")
}

func pad(n int) string {
	if n < 10 {
		return "0" + string(rune('0'+n))
	}
	return string(rune('0'+n/10)) + string(rune('0'+n%10))
}

func parseHour(t string) int {
	// e.g. "2026-04-17 14:26:40 (UTC+7)"
	parts := strings.Fields(t)
	if len(parts) < 2 {
		return -1
	}
	timePart := parts[1] // "14:26:40"
	hm := strings.SplitN(timePart, ":", 2)
	if len(hm) < 1 {
		return -1
	}
	h := 0
	for _, c := range hm[0] {
		if c < '0' || c > '9' {
			return -1
		}
		h = h*10 + int(c-'0')
	}
	return h
}

// TopHosts returns the top N hosts by alert count
func TopHosts(s *models.DaySummary, n int) []models.TimeSlot {
	type kv struct {
		k string
		v int
	}
	var sorted []kv
	for k, v := range s.ByHost {
		sorted = append(sorted, kv{k, v})
	}
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].v > sorted[j].v })
	if n > len(sorted) {
		n = len(sorted)
	}
	result := make([]models.TimeSlot, n)
	for i := 0; i < n; i++ {
		result[i] = models.TimeSlot{Hour: sorted[i].k, Count: sorted[i].v}
	}
	return result
}
