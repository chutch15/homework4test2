let scatterSVG = d3.select("#scatter");
let boxSVG = d3.select("#boxplot");
let width = +scatterSVG.attr("width") - 60, height = +scatterSVG.attr("height") - 60;
let margin = {top: 30, right: 30, bottom: 50, left: 50};

let dataset, numericAttrs, categoricalAttrs, colorScale, selectedPoints = [];

loadDataset(d3.select("#dataset").property("value"));
d3.select("#dataset").on("change", e => loadDataset(e.target.value));

async function loadDataset(path) {
  dataset = await d3.csv(path, d3.autoType);
  let keys = Object.keys(dataset[0]);
  numericAttrs = keys.filter(k => typeof dataset[0][k] === "number");
  categoricalAttrs = keys.filter(k => typeof dataset[0][k] === "string");

  updateDropdown("#xAttr", numericAttrs);
  updateDropdown("#yAttr", numericAttrs);
  updateDropdown("#colorAttr", categoricalAttrs);
  updateDropdown("#boxAttr", numericAttrs);

  drawScatter();
}

function updateDropdown(selector, arr) {
  let sel = d3.select(selector);
  sel.selectAll("option").remove();
  sel.selectAll("option")
    .data(arr)
    .enter()
    .append("option")
    .text(d => d);
  sel.on("change", drawScatter);
}

function drawScatter() {
  scatterSVG.selectAll("*").remove();

  let xAttr = d3.select("#xAttr").property("value");
  let yAttr = d3.select("#yAttr").property("value");
  let colorAttr = d3.select("#colorAttr").property("value");

  let xScale = d3.scaleLinear()
    .domain(d3.extent(dataset, d => d[xAttr])).nice()
    .range([margin.left, width]);

  let yScale = d3.scaleLinear()
    .domain(d3.extent(dataset, d => d[yAttr])).nice()
    .range([height, margin.top]);

  colorScale = d3.scaleOrdinal(d3.schemeSet2)
    .domain([...new Set(dataset.map(d => d[colorAttr]))]);

  scatterSVG.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale));
  scatterSVG.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale));

  scatterSVG.append("text")
    .attr("x", width / 2)
    .attr("y", height + 40)
    .text(xAttr);

  scatterSVG.append("text")
    .attr("x", -height / 2)
    .attr("y", 15)
    .attr("transform", "rotate(-90)")
    .text(yAttr);

  let points = scatterSVG.append("g")
    .selectAll("circle")
    .data(dataset)
    .join("circle")
    .attr("cx", d => xScale(d[xAttr]))
    .attr("cy", d => yScale(d[yAttr]))
    .attr("r", 5)
    .attr("fill", d => colorScale(d[colorAttr]))
    .attr("opacity", 0.8);

  // Brushing (rectangular lasso)
  let brush = d3.brush()
    .extent([[margin.left, margin.top], [width, height]])
    .on("end", brushed);

  scatterSVG.append("g").call(brush);

  function brushed({selection}) {
    if (!selection) {
      points.classed("selected", false);
      selectedPoints = [];
      drawBoxplot([]);
      d3.select("#selected-count").text("");
      return;
    }
    const [[x0, y0], [x1, y1]] = selection;
    selectedPoints = dataset.filter(d =>
      x0 <= xScale(d[xAttr]) && xScale(d[xAttr]) <= x1 &&
      y0 <= yScale(d[yAttr]) && yScale(d[yAttr]) <= y1
    );
    points.classed("selected", d => selectedPoints.includes(d));
    d3.select("#selected-count").text(`${selectedPoints.length} points selected`);
    drawBoxplot(selectedPoints);
  }
}

// ------------------------------
// FIXED BOX PLOT IMPLEMENTATION
// ------------------------------
function drawBoxplot(points) {
  boxSVG.selectAll("*").remove();

  if (points.length === 0) return; // nothing selected

  let boxAttr = d3.select("#boxAttr").property("value");
  let colorAttr = d3.select("#colorAttr").property("value");

  console.log("Drawing boxplot for", boxAttr, "from", points.length, "points");

  // Group selected points by the color attribute
  let groups = d3.group(points, d => d[colorAttr]);
  let groupNames = Array.from(groups.keys());

  // Compute box stats for each group
  let boxData = groupNames.map(g => {
    let vals = groups.get(g).map(d => d[boxAttr]).sort(d3.ascending);
    if (vals.length === 0) return { key: g, empty: true };

    let q1 = d3.quantile(vals, 0.25),
        median = d3.quantile(vals, 0.5),
        q3 = d3.quantile(vals, 0.75);
    let iqr = q3 - q1;
    let min = Math.max(d3.min(vals), q1 - 1.5 * iqr);
    let max = Math.min(d3.max(vals), q3 + 1.5 * iqr);

    return { key: g, q1, median, q3, min, max };
  });

  // Scales
  let xScale = d3.scaleBand()
    .domain(groupNames)
    .range([margin.left, 400])
    .padding(0.3);

  let yScale = d3.scaleLinear()
    .domain(d3.extent(dataset, d => d[boxAttr])).nice()
    .range([height, margin.top]);

  // Axes
  boxSVG.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale));
  boxSVG.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale));

  // Box groups
  let gBoxes = boxSVG.append("g")
    .selectAll(".box")
    .data(boxData)
    .join("g")
    .attr("class", "box")
    .attr("transform", d => `translate(${xScale(d.key)},0)`);

  // Draw boxes for non-empty groups
  gBoxes.filter(d => !d.empty)
    .each(function(d, i) {
      let g = d3.select(this);

      // Whisker
      g.append("line")
        .attr("x1", xScale.bandwidth() / 2)
        .attr("x2", xScale.bandwidth() / 2)
        .attr("y1", yScale(d.min))
        .attr("y2", yScale(d.max))
        .attr("stroke", "#333")
        .attr("stroke-width", 1);

      // Box
      g.append("rect")
        .attr("x", 0)
        .attr("width", xScale.bandwidth())
        .attr("y", yScale(d.q3))
        .attr("height", yScale(d.q1) - yScale(d.q3))
        .attr("fill", colorScale(d.key))
        .attr("opacity", 0.7)
        .transition()
        .duration(600)
        .delay(i * 100)
        .attr("opacity", 1);

      // Median line
      g.append("line")
        .attr("x1", 0)
        .attr("x2", xScale.bandwidth())
        .attr("y1", yScale(d.median))
        .attr("y2", yScale(d.median))
        .attr("stroke", "black")
        .attr("stroke-width", 2);
    });

  // Group labels
  gBoxes.append("text")
    .attr("x", xScale.bandwidth() / 2)
    .attr("y", height + 30)
    .attr("text-anchor", "middle")
    .text(d => d.key);
}
