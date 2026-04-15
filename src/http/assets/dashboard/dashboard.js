const SVG_NS = 'http://www.w3.org/2000/svg';
const graphCanvas = document.getElementById('graphCanvas');
const graphTitle = document.getElementById('graphTitle');
const graphSub = document.getElementById('graphSub');
const statClients = document.getElementById('statClients');
const statRelay = document.getElementById('statRelay');
const roleChip = document.getElementById('roleChip');
const panelCount = document.getElementById('panelCount');
const clientList = document.getElementById('clientList');
const uptimeChip = document.getElementById('uptimeChip');

const CX = 360, CY = 160;
const ORBIT_RX = 200, ORBIT_RY = 110;
const NODE_COLORS = ['#2dd4bf','#38bdf8','#a78bfa','#fb923c','#f472b6','#facc15','#4ade80','#f87171'];
let prevNodeCount = -1;

function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

function renderGraph(clients, relayCount) {
    const nodes = [];
    if (clients) {
        clients.forEach(function(c) {
            nodes.push({ label: c.username.slice(0,2).toUpperCase(), name: c.username, type: 'client', userId: c.userId || 0 });
        });
    }
    for (var r = 0; r < (relayCount || 0); r++) {
        nodes.push({ label: 'R' + (r+1), name: 'Relay ' + (r+1), type: 'relay' });
    }

    if (nodes.length === prevNodeCount) return;
    prevNodeCount = nodes.length;

    graphCanvas.innerHTML = '';

    /* defs */
    const defs = svgEl('defs', {});
    const glow = svgEl('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
    glow.appendChild(svgEl('feGaussianBlur', { stdDeviation: '4', result: 'blur' }));
    const merge = svgEl('feMerge', {});
    merge.appendChild(svgEl('feMergeNode', { 'in': 'blur' }));
    merge.appendChild(svgEl('feMergeNode', { 'in': 'SourceGraphic' }));
    glow.appendChild(merge);
    defs.appendChild(glow);
    graphCanvas.appendChild(defs);

    /* center glow ring */
    const pulse = svgEl('circle', {
        cx: CX, cy: CY, r: '32',
        fill: nodes.length > 0 ? 'rgba(45,212,191,0.1)' : 'rgba(248,113,113,0.08)',
        stroke: 'none'
    });
    pulse.innerHTML = '<animate attributeName="r" values="28;38;28" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.15;0.05;0.15" dur="3s" repeatCount="indefinite"/>';
    graphCanvas.appendChild(pulse);

    /* connecting lines + satellite nodes */
    var total = nodes.length;
    var spread = total <= 1 ? 0 : Math.PI * 1.4;
    var startAngle = total <= 1 ? 0 : -Math.PI / 2 - spread / 2;

    nodes.forEach(function(node, i) {
        var angle = total === 1 ? -Math.PI/2 : startAngle + (spread / (total - 1)) * i;
        var nx = CX + Math.cos(angle) * ORBIT_RX;
        var ny = CY + Math.sin(angle) * ORBIT_RY;
        var color = NODE_COLORS[i % NODE_COLORS.length];

        /* line (static dashes) */
        var line = svgEl('line', {
            x1: CX, y1: CY, x2: nx, y2: ny,
            stroke: color, 'stroke-width': '1.5', 'stroke-opacity': '0.3',
            'stroke-dasharray': '6 4'
        });
        graphCanvas.appendChild(line);

        /* outbound travelling dot (center -> satellite) */
        var dotOut = svgEl('circle', { r: '2.5', fill: color, opacity: '0.8' });
        var motionOut = svgEl('animateMotion', {
            dur: (2 + Math.random()).toFixed(1) + 's',
            repeatCount: 'indefinite',
            path: 'M'+CX+','+CY+' L'+nx+','+ny
        });
        dotOut.appendChild(motionOut);
        graphCanvas.appendChild(dotOut);

        /* inbound travelling dot (satellite -> center) */
        var dotIn = svgEl('circle', { r: '2.5', fill: color, opacity: '0.6' });
        var motionIn = svgEl('animateMotion', {
            dur: (2.5 + Math.random()).toFixed(1) + 's',
            repeatCount: 'indefinite',
            path: 'M'+nx+','+ny+' L'+CX+','+CY
        });
        dotIn.appendChild(motionIn);
        graphCanvas.appendChild(dotIn);

        /* satellite node group */
        var g = svgEl('g', {
            style: 'animation: nodeAppear 0.5s cubic-bezier(0.16,1,0.3,1) ' + (i * 0.08).toFixed(2) + 's both; transform-origin: '+nx+'px '+ny+'px'
        });

        /* outer ring */
        g.appendChild(svgEl('circle', {
            cx: nx, cy: ny, r: '24',
            fill: 'none', stroke: color, 'stroke-width': '1', 'stroke-opacity': '0.2'
        }));

        /* filled circle */
        g.appendChild(svgEl('circle', {
            cx: nx, cy: ny, r: '18',
            fill: '#09090b', stroke: color, 'stroke-width': '1.5', 'stroke-opacity': '0.6'
        }));

        /* avatar image or label */
        if (node.userId && node.userId > 0) {
            var clipId = 'avatarClip' + i;
            var clip = svgEl('clipPath', { id: clipId });
            clip.appendChild(svgEl('circle', { cx: nx, cy: ny, r: '15' }));
            defs.appendChild(clip);

            var img = svgEl('image', {
                x: nx - 15, y: ny - 15, width: '30', height: '30',
                href: '/api/avatar?userId=' + node.userId,
                'clip-path': 'url(#' + clipId + ')',
                preserveAspectRatio: 'xMidYMid slice'
            });
            g.appendChild(img);
        } else {
            var txt = svgEl('text', {
                x: nx, y: ny, 'text-anchor': 'middle', 'dominant-baseline': 'central',
                fill: color, 'font-family': 'IBM Plex Mono, monospace',
                'font-size': '10', 'font-weight': '600', 'letter-spacing': '0.05em'
            });
            txt.textContent = node.label;
            g.appendChild(txt);
        }

        /* name below */
        var nameTxt = svgEl('text', {
            x: nx, y: ny + 30, 'text-anchor': 'middle',
            fill: '#a1a1aa', 'font-family': 'Instrument Sans, sans-serif',
            'font-size': '9', 'font-weight': '500'
        });
        nameTxt.textContent = node.name;
        g.appendChild(nameTxt);

        graphCanvas.appendChild(g);
    });

    /* center node (on top) */
    var cg = svgEl('g', { filter: 'url(#glow)' });
    var centerColor = nodes.length > 0 ? '#2dd4bf' : '#f87171';

    cg.appendChild(svgEl('circle', {
        cx: CX, cy: CY, r: '26',
        fill: '#09090b', stroke: centerColor, 'stroke-width': '2'
    }));

    var mTxt = svgEl('text', {
        x: CX, y: CY, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        fill: centerColor, 'font-family': 'Instrument Sans, sans-serif',
        'font-size': '13', 'font-weight': '700'
    });
    mTxt.textContent = 'MCP';
    cg.appendChild(mTxt);
    graphCanvas.appendChild(cg);
}

/* initial idle state */
renderGraph([], 0);

const startTime = Date.now();

function updateUptime() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    uptimeChip.textContent = h + ':' + m + ':' + s;
}

setInterval(updateUptime, 1000);

function getInitials(name) {
    return name.slice(0, 2).toUpperCase();
}

function renderClients(clients) {
    if (!clients || clients.length === 0) {
        clientList.innerHTML = '<div class="client-empty"><div class="client-empty-icon">◌</div>No clients connected</div>';
        return;
    }

    clientList.innerHTML = clients.map(function(c) {
        var transportClass = c.transport === 'ws' ? 'transport-ws' : 'transport-http';
        var avatarContent = '';
        if (c.userId && c.userId > 0) {
            avatarContent = '<img src="/api/avatar?userId=' + c.userId + '" data-initials="' + getInitials(c.username) + '" />';
        } else {
            avatarContent = getInitials(c.username);
        }
        return '<div class="client-card">' +
            '<div class="client-avatar">' + avatarContent + '</div>' +
            '<div class="client-info">' +
                '<div class="client-name-row">' +
                    '<span class="client-username">' + c.username + '</span>' +
                    '<span class="client-transport ' + transportClass + '">' + c.transport.toUpperCase() + '</span>' +
                '</div>' +
                '<div class="client-place">' + c.placeName + '</div>' +
                '<div class="client-id">' + c.clientId + '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    /* attach onerror fallback to avatar images */
    clientList.querySelectorAll('.client-avatar img').forEach(function(img) {
        img.onerror = function() {
            var initials = img.getAttribute('data-initials') || '??';
            img.parentNode.textContent = initials;
        };
    });
}

async function updateStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();

        if (data.connected) {
            graphTitle.textContent = 'Connected';
            graphTitle.style.color = 'var(--success)';
            graphSub.textContent = data.clientCount + ' client' + (data.clientCount !== 1 ? 's' : '') + ' active';
        } else {
            graphTitle.textContent = 'Disconnected';
            graphTitle.style.color = 'var(--error)';
            graphSub.textContent = 'Waiting for Roblox clients\u2026';
        }

        renderGraph(data.clients || [], data.relayClients || 0);

        statClients.textContent = data.clientCount;
        statRelay.textContent = data.relayClients;
        roleChip.textContent = data.role;
        panelCount.textContent = data.clientCount;

        renderClients(data.clients);
    } catch (e) {
        graphTitle.textContent = 'Offline';
        graphTitle.style.color = 'var(--error)';
        graphSub.textContent = 'Cannot reach server';
        renderGraph([], 0);
    }
}

setInterval(updateStatus, 2000);
updateStatus();
