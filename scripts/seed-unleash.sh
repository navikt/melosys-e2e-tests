#!/bin/bash
# Seed script to populate Unleash with Melosys feature toggles
# Run this after starting Unleash

UNLEASH_URL=${UNLEASH_URL:-http://localhost:4242}
API_TOKEN=${API_TOKEN:-"*:*.unleash-insecure-api-token"}

echo "🚀 Seeding Unleash at $UNLEASH_URL with Melosys feature toggles..."

# Wait for Unleash to be ready
echo "⏳ Waiting for Unleash to be healthy..."
max_retries=30
retry_count=0
while ! curl -s "$UNLEASH_URL/health" > /dev/null; do
    retry_count=$((retry_count + 1))
    if [ $retry_count -ge $max_retries ]; then
        echo "❌ Unleash did not become healthy in time"
        exit 1
    fi
    echo "   Waiting... (attempt $retry_count/$max_retries)"
    sleep 2
done
echo "✅ Unleash is healthy!"

# Function to create a feature toggle
create_toggle() {
    local toggle_name=$1
    local description=$2
    local enabled=${3:-true}

    echo "Creating toggle: $toggle_name (enabled: $enabled)"

    # Create feature toggle
    curl -s -X POST "$UNLEASH_URL/api/admin/projects/default/features" \
        -H "Authorization: $API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"$toggle_name\",
            \"description\": \"$description\",
            \"type\": \"release\",
            \"impressionData\": false
        }" > /dev/null

    # Enable/disable in development environment
    if [ "$enabled" = "true" ]; then
        curl -s -X POST "$UNLEASH_URL/api/admin/projects/default/features/$toggle_name/environments/development/on" \
            -H "Authorization: $API_TOKEN" > /dev/null
    else
        curl -s -X POST "$UNLEASH_URL/api/admin/projects/default/features/$toggle_name/environments/development/off" \
            -H "Authorization: $API_TOKEN" > /dev/null
    fi
}

# Create all Melosys feature toggles based on ToggleName.kt
echo ""
echo "📝 Creating feature toggles..."
create_toggle "melosys.behandlingstype.klage" "Behandlingstype klage" true
create_toggle "melosys.send_melding_om_vedtak" "Send melding om vedtak" true
create_toggle "melosys.11_3_a_Norge_er_utpekt" "11.3.a Norge er utpekt" true
create_toggle "melosys.skattehendelse.consumer" "Skattehendelse consumer" true
create_toggle "melosys.arsavregning" "Årsavregning" true
create_toggle "melosys.arsavregning.uten.flyt" "Årsavregning uten flyt" false
create_toggle "melosys.arsavregning.eos_pensjonist" "Årsavregning EØS pensjonist" true
create_toggle "melosys.pensjonist" "Pensjonist" true
create_toggle "melosys.pensjonist_eos" "Pensjonist EØS" true
create_toggle "standardvedlegg_eget_vedlegg_avtaleland" "Standardvedlegg eget vedlegg avtaleland" true
create_toggle "melosys.faktureringskomponenten.ikke-tidligere-perioder" "Faktureringskomponenten ikke tidligere perioder" true
create_toggle "melosys.send_popp_hendelse" "Send POPP hendelse" true

echo ""
echo "✅ All feature toggles created!"
echo ""
echo "🌐 Access Unleash UI at: $UNLEASH_URL"
echo "   Username: admin"
echo "   Password: unleash4all"
