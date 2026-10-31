/* ============================================
   Messliner — Lightweight Canvas Charts
   ============================================ */

const Charts = {
  /**
   * Draw a bar chart on a canvas
   * @param {string} canvasId
   * @param {Object} config - { labels: [], data: [], color, title }
   */
  bar(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Responsive sizing
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = (parseInt(getComputedStyle(canvas).height) || 250) * dpr;
    canvas.style.width = rect.width + 'px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = parseInt(getComputedStyle(canvas).height) || 250;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const { labels = [], data = [], color = '#6366F1' } = config;
    if (data.length === 0) {
      this._drawEmpty(ctx, w, h);
      return;
    }

    const maxVal = Math.max(...data, 1);
    const barCount = data.length;
    const barGap = Math.max(4, chartW / barCount * 0.3);
    const barWidth = Math.max(8, (chartW - barGap * (barCount + 1)) / barCount);

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      // Y labels
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      const val = Math.round(maxVal - (maxVal / gridLines) * i);
      ctx.fillText(val, padding.left - 8, y + 4);
    }
    ctx.setLineDash([]);

    // Animated bars
    const animate = (progress) => {
      ctx.clearRect(padding.left, padding.top, chartW, chartH);

      // Redraw grid
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartH / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Bars
      data.forEach((val, i) => {
        const barH = (val / maxVal) * chartH * progress;
        const x = padding.left + barGap + i * (barWidth + barGap);
        const y = padding.top + chartH - barH;

        // Bar
        ctx.fillStyle = color;
        ctx.beginPath();
        const radius = Math.min(4, barWidth / 2);
        ctx.moveTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.arcTo(x + barWidth, y, x + barWidth, y + radius, radius);
        ctx.lineTo(x + barWidth, padding.top + chartH);
        ctx.lineTo(x, padding.top + chartH);
        ctx.closePath();
        ctx.fill();

        // Label
        if (labels[i]) {
          ctx.fillStyle = '#9CA3AF';
          ctx.font = '10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(labels[i], x + barWidth / 2, h - padding.bottom + 16);
        }
      });

      if (progress < 1) {
        requestAnimationFrame(() => animate(Math.min(1, progress + 0.04)));
      }
    };

    animate(0);
  },

  /**
   * Draw a donut chart
   * @param {string} canvasId
   * @param {Object} config - { labels: [], data: [], colors: [] }
   */
  donut(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, parseInt(getComputedStyle(canvas).height) || 250);
    canvas.width = rect.width * dpr;
    canvas.height = (parseInt(getComputedStyle(canvas).height) || 250) * dpr;
    canvas.style.width = rect.width + 'px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = parseInt(getComputedStyle(canvas).height) || 250;

    const { labels = [], data = [], colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'] } = config;
    const total = data.reduce((a, b) => a + b, 0);

    if (total === 0) {
      this._drawEmpty(ctx, w, h);
      return;
    }

    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.4;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 20;
    const innerRadius = radius * 0.6;
    let startAngle = -Math.PI / 2;

    // Animated donut
    const animate = (progress) => {
      ctx.clearRect(0, 0, w, h);
      let currentAngle = -Math.PI / 2;

      data.forEach((val, i) => {
        const sliceAngle = (val / total) * Math.PI * 2 * progress;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, currentAngle, currentAngle + sliceAngle);
        ctx.arc(cx, cy, innerRadius, currentAngle + sliceAngle, currentAngle, true);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        currentAngle += sliceAngle;
      });

      // Center text
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Utils.currency(total), cx, cy - 8);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('Total', cx, cy + 12);

      // Legend
      const legendX = w * 0.7;
      let legendY = Math.max(30, cy - (data.length * 24) / 2);
      labels.forEach((label, i) => {
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(legendX, legendY + 1, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#374151';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, legendX + 12, legendY + 4);

        ctx.fillStyle = '#9CA3AF';
        ctx.font = '11px Inter, sans-serif';
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
        ctx.fillText(`${Utils.currency(data[i])} (${pct}%)`, legendX + 12, legendY + 18);

        legendY += 36;
      });

      if (progress < 1) {
        requestAnimationFrame(() => animate(Math.min(1, progress + 0.03)));
      }
    };

    animate(0);
  },

  /**
   * Draw a line chart
   * @param {string} canvasId
   * @param {Object} config - { labels: [], datasets: [{ data: [], color, label }] }
   */
  line(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = (parseInt(getComputedStyle(canvas).height) || 250) * dpr;
    canvas.style.width = rect.width + 'px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = parseInt(getComputedStyle(canvas).height) || 250;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const { labels = [], datasets = [] } = config;
    if (datasets.length === 0 || labels.length === 0) {
      this._drawEmpty(ctx, w, h);
      return;
    }

    const allData = datasets.flatMap(ds => ds.data);
    const maxVal = Math.max(...allData, 1);

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal - (maxVal / gridLines) * i), padding.left - 8, y + 4);
    }
    ctx.setLineDash([]);

    // X labels
    const step = Math.max(1, Math.floor(labels.length / 7));
    labels.forEach((label, i) => {
      if (i % step === 0 || i === labels.length - 1) {
        const x = padding.left + (i / (labels.length - 1 || 1)) * chartW;
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, h - padding.bottom + 16);
      }
    });

    // Lines
    datasets.forEach(ds => {
      const { data, color = '#6366F1' } = ds;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();

      data.forEach((val, i) => {
        const x = padding.left + (i / (data.length - 1 || 1)) * chartW;
        const y = padding.top + chartH - (val / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Area fill
      ctx.lineTo(padding.left + chartW, padding.top + chartH);
      ctx.lineTo(padding.left, padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = color.replace(')', ', 0.08)').replace('rgb', 'rgba');
      if (ctx.fillStyle === color) {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.fill();
      }

      // Dots
      data.forEach((val, i) => {
        const x = padding.left + (i / (data.length - 1 || 1)) * chartW;
        const y = padding.top + chartH - (val / maxVal) * chartH;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });
  },

  /**
   * Draw empty state text on canvas
   */
  _drawEmpty(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data available', w / 2, h / 2);
  }
};

console.log('[Messliner] Charts loaded');
