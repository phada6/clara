#!/bin/bash

# Clara Docker Quick Recovery Script
# Use this when Clara gets stuck during Docker startup

echo "🚨 Clara Docker Quick Recovery"
echo "=============================="
echo ""

# Function to run command and show result
run_cmd() {
    local cmd="$1"
    local desc="$2"
    
    echo "🔧 $desc..."
    if eval "$cmd" 2>/dev/null; then
        echo "✅ $desc completed"
    else
        echo "⚠️  $desc failed (this may be normal)"
    fi
    echo ""
}

# Stop Clara containers
run_cmd "docker stop clara_python clara_comfyui clara_n8n" "Stopping Clara containers"

# Remove Clara containers
run_cmd "docker rm -f clara_python clara_comfyui clara_n8n" "Removing Clara containers"

# Remove Clara network
run_cmd "docker network rm clara_network" "Removing Clara network"

# Clean up any stuck containers
echo "🧹 Cleaning up stuck containers..."
STUCK_CONTAINERS=$(docker ps -aq --filter "status=created" --filter "status=restarting" 2>/dev/null)
if [ -n "$STUCK_CONTAINERS" ]; then
    docker rm -f $STUCK_CONTAINERS
    echo "✅ Removed stuck containers"
else
    echo "✅ No stuck containers found"
fi
echo ""

# Optional: Clean up Docker system (ask user)
echo "🗑️  Optional: Clean up Docker system cache?"
echo "   This will remove unused images, containers, and networks"
echo "   (This is safe but will require re-downloading images)"
echo ""
read -p "Clean up Docker system? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Cleaning up Docker system..."
    docker system prune -af
    echo "✅ Docker system cleaned up"
else
    echo "⏭️  Skipping Docker system cleanup"
fi

echo ""
echo "🎉 Recovery complete!"
echo ""
echo "💡 Next steps:"
echo "   1. Restart Clara application"
echo "   2. If still having issues, run: node troubleshoot/diagnose-docker-hang.js"
echo "   3. Check Clara logs for more details"
echo ""
echo "🔧 If problems persist:"
echo "   • Restart Docker Desktop completely"
echo "   • Check your internet connection"
echo "   • Make sure you have enough disk space"
echo "" 