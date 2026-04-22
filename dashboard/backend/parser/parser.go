package parser

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/namsee/banhmi/dashboard/models"
)

var (
	reSeverity    = regexp.MustCompile(`(?i)\*\*Severity\*\*[:\s]+[🔴🟡🟢]?\s*(\w+)`)
	reStatus      = regexp.MustCompile(`(?i)\*\*Status\*\*[:\s]+(\w+)`)
	reDescription = regexp.MustCompile(`(?i)\*\*Description\*\*[:\s]+(.+)`)
	reSource      = regexp.MustCompile(`(?i)\*\*Source\*\*[:\s]+(.+)`)
	reHost        = regexp.MustCompile(`(?i)\*\*Host(?:/Service)?\*\*[:\s]+(.+)`)
	reValue       = regexp.MustCompile(`(?i)\*\*Value\*\*[:\s]+(.+)`)
	reTime        = regexp.MustCompile(`(?i)\*\*Time\*\*[:\s]+(.+)`)
	reDetails     = regexp.MustCompile(`(?i)\*\*Details\*\*[:\s]+(.+)`)
)

func extract(re *regexp.Regexp, content string) string {
	m := re.FindStringSubmatch(content)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}

// normalizeSeverity maps emoji/text variants to canonical lowercase
func normalizeSeverity(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "critical", "🔴":
		return "critical"
	case "warning", "🟡":
		return "warning"
	case "info", "🟢":
		return "info"
	default:
		return strings.ToLower(strings.TrimSpace(s))
	}
}

// normalizeStatus maps to "firing" or "resolved"
func normalizeStatus(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "firing":
		return "firing"
	case "resolved":
		return "resolved"
	default:
		return strings.ToLower(strings.TrimSpace(s))
	}
}

// ParseFile parses a single alert markdown file
func ParseFile(alertsRoot, date, filename string) (*models.Alert, error) {
	path := filepath.Join(alertsRoot, date, filename)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	content := string(data)

	id := strings.TrimSuffix(filename, ".md")
	alert := &models.Alert{
		ID:          date + "/" + id,
		Date:        date,
		File:        filename,
		Severity:    normalizeSeverity(extract(reSeverity, content)),
		Status:      normalizeStatus(extract(reStatus, content)),
		Description: extract(reDescription, content),
		Source:      extract(reSource, content),
		Host:        extract(reHost, content),
		Value:       extract(reValue, content),
		Time:        extract(reTime, content),
		Details:     extract(reDetails, content),
	}

	// Build embedding text: description + details (most semantically rich)
	parts := []string{}
	if alert.Description != "" {
		parts = append(parts, alert.Description)
	}
	if alert.Details != "" {
		parts = append(parts, alert.Details)
	}
	if alert.Source != "" {
		parts = append(parts, "Source: "+alert.Source)
	}
	alert.EmbedText = strings.Join(parts, ". ")

	return alert, nil
}

// ParseDay parses all alert files for a given date directory
func ParseDay(alertsRoot, date string) ([]*models.Alert, error) {
	dir := filepath.Join(alertsRoot, date)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read dir %s: %w", dir, err)
	}

	var alerts []*models.Alert
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		alert, err := ParseFile(alertsRoot, date, entry.Name())
		if err != nil {
			return nil, err
		}
		alerts = append(alerts, alert)
	}
	return alerts, nil
}

// ParseAll parses all date directories under alertsRoot
func ParseAll(alertsRoot string) ([]*models.Alert, error) {
	entries, err := os.ReadDir(alertsRoot)
	if err != nil {
		return nil, fmt.Errorf("read alerts root %s: %w", alertsRoot, err)
	}

	var all []*models.Alert
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		alerts, err := ParseDay(alertsRoot, entry.Name())
		if err != nil {
			return nil, err
		}
		all = append(all, alerts...)
	}
	return all, nil
}
