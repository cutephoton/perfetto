// Copyright (C) 2018 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {searchSegment} from '../base/binary_search';
import {cropText} from '../common/canvas_utils';

import {CallsiteInfo} from './globals';

interface Node {
  width: number;
  x: number;
  nextXForChildren: number;
  size: number;
}

interface CallsiteInfoWidth {
  callsite: CallsiteInfo;
  width: number;
}

const NODE_HEIGHT_MIN = 12;
const NODE_HEIGHT_MAX = 25;

export class Flamegraph {
  private nodeHeight = NODE_HEIGHT_MIN;
  private flamegraphData: CallsiteInfo[];
  private maxDepth = -1;
  private calculateNodeHeight = true;
  private textSize = 12;
  // Key for the map is depth followed by x coordinate - `depth;x`
  private graphData: Map<string, CallsiteInfoWidth> = new Map();
  private xStartsPerDepth: Map<number, number[]> = new Map();

  private hoveredX = -1;
  private hoveredY = -1;
  private hoveredCallsite?: CallsiteInfo;
  private clickedCallsite?: CallsiteInfo;

  // For each node, we use this map to get information about it's parent
  // (total size of it, width and where it starts in graph) so we can
  // calculate it's own position in graph.
  // This one is store for base flamegraph when no clicking has happend.
  private baseMap = new Map<number, Node>();

  constructor(flamegraphData: CallsiteInfo[]) {
    this.flamegraphData = flamegraphData;
    this.findMaxDepth();
    this.calculateNodeHeight = true;
  }

  private findMaxDepth() {
    this.flamegraphData.forEach((value: CallsiteInfo) => {
      this.maxDepth = this.maxDepth < value.depth ? value.depth : this.maxDepth;
    });
  }

  hash(s: string): number {
    let hash = 0x811c9dc5 & 0xfffffff;
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = (hash * 16777619) & 0xffffffff;
    }
    return hash & 0xff;
  }

  generateColor(name: string|undefined): string {
    if (name === undefined) {
      return 'grey';
    }
    const hue = this.hash(name);
    const saturation = 50;
    return `hsl(${hue}, ${saturation}%, 65%)`;
  }

  /**
   * Caller will have to call draw method ater updating data to have updated
   * graph.
   */
  updateData(flamegraphData: CallsiteInfo[]) {
    this.flamegraphData = flamegraphData;
    this.findMaxDepth();
    this.calculateNodeHeight = true;
  }

  draw(
      ctx: CanvasRenderingContext2D, width: number, height: number, x = 0,
      y = 0, unit = 'B') {
    if (this.calculateNodeHeight) {
      const calcHeight = Math.round((height - 10) / (this.maxDepth + 2));
      this.calculateNodeHeight = false;
      this.nodeHeight = calcHeight < NODE_HEIGHT_MIN ?
          NODE_HEIGHT_MIN :
          calcHeight > NODE_HEIGHT_MAX ? NODE_HEIGHT_MAX : calcHeight;
      this.textSize = this.nodeHeight - 3 > 15 ? 15 : this.nodeHeight - 3;
    }

    if (this.flamegraphData !== undefined) {
      // Finding total size of roots.
      let totalSize = 0;
      this.flamegraphData.forEach((value: CallsiteInfo) => {
        if (value.parentHash === -1) {
          totalSize += value.totalSize;
        }
      });

      // For each node, we use this map to get information about it's parent
      // (total size of it, width and where it starts in graph) so we can
      // calculate it's own position in graph.
      const nodesMap = new Map<number, Node>();
      let currentY = y;
      nodesMap.set(-1, {width, nextXForChildren: x, size: totalSize, x});

      // Initialize data needed for click/hover behaivior.
      this.graphData = new Map();
      this.xStartsPerDepth = new Map();

      // Draw root node.
      ctx.fillStyle = 'grey';
      ctx.fillRect(x, currentY, width, this.nodeHeight);
      currentY += this.nodeHeight;

      const clickedNode = this.clickedCallsite !== undefined ?
          this.baseMap.get(this.clickedCallsite.hash) :
          undefined;

      for (let i = 0; i < this.flamegraphData.length; i++) {
        if (currentY > height) {
          break;
        }
        const value = this.flamegraphData[i];
        const parentNode = nodesMap.get(value.parentHash);
        if (parentNode === undefined) {
          continue;
        }
        // If node is clicked, determine if we should draw current node.
        let shouldDraw = true;
        let isFullWidth = false;
        let isGreyedOut = false;

        const oldNode = this.baseMap.get(value.hash);
        if (clickedNode !== undefined && this.clickedCallsite !== undefined &&
            oldNode !== undefined) {
          isFullWidth = value.depth <= this.clickedCallsite.depth;
          isGreyedOut = value.depth < this.clickedCallsite.depth;
          shouldDraw = isFullWidth ? (oldNode.x <= clickedNode.x) &&
                  ((oldNode.x + oldNode.width >=
                    clickedNode.x + clickedNode.width)) :
                                     (oldNode.x >= clickedNode.x) &&
                  ((oldNode.x + oldNode.width <=
                    clickedNode.x + clickedNode.width));
        }
        if (!shouldDraw) {
          continue;
        }
        const parent = value.parentHash;
        const parentSize = parent === -1 ? totalSize : parentNode.size;
        // Calculate node's width based on its proportion in parent.
        const width =
            (isFullWidth ? 1 : value.totalSize / parentSize) * parentNode.width;

        const currentX = parentNode.nextXForChildren;
        currentY = this.nodeHeight * (value.depth + 1);

        // Draw node.
        ctx.fillStyle =
            isGreyedOut ? '#c0c0c0' : this.generateColor(value.name);
        ctx.fillRect(currentX, currentY, width, this.nodeHeight);

        // Draw name.
        const name = this.getCallsiteName(value);
        ctx.font = `${this.textSize}px Google Sans`;
        const charWidth = ctx.measureText(name).width / name.length;
        const text = cropText(name, charWidth, width);
        ctx.fillStyle = 'black';
        ctx.fillText(text, currentX + 5, currentY + this.nodeHeight - 4);

        // Draw border around node.
        ctx.strokeStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        ctx.lineTo(currentX, currentY + this.nodeHeight);
        ctx.lineTo(currentX + width, currentY + this.nodeHeight);
        ctx.lineTo(currentX + width, currentY);
        ctx.moveTo(currentX, currentY);
        ctx.lineWidth = 1;
        ctx.closePath();
        ctx.stroke();

        // Set current node's data in map for children to use.
        nodesMap.set(value.hash, {
          width,
          nextXForChildren: currentX,
          size: value.totalSize,
          x: currentX
        });
        // Update next x coordinate in parent.
        nodesMap.set(value.parentHash, {
          width: parentNode.width,
          nextXForChildren: currentX + width,
          size: parentNode.size,
          x: parentNode.x
        });

        // Add this node for recognizing in click/hover.
        // Map graphData contains one callsite which is on that depth and X
        // start. Map xStartsPerDepth for each depth contains all X start
        // coordinates that callsites on that level have.
        this.graphData.set(
            `${value.depth};${currentX}`, {callsite: value, width});
        const xStarts = this.xStartsPerDepth.get(value.depth);
        if (xStarts === undefined) {
          this.xStartsPerDepth.set(value.depth, [currentX]);
        } else {
          xStarts.push(currentX);
        }
      }

      if (clickedNode === undefined) {
        this.baseMap = nodesMap;
      }

      if (this.hoveredX > -1 && this.hoveredY > -1 && this.hoveredCallsite) {
        // Draw the tooltip.
        const line1 = this.getCallsiteName(this.hoveredCallsite);
        const percentage = this.hoveredCallsite.totalSize / totalSize * 100;
        const line2 = `total: ${this.hoveredCallsite.totalSize}${unit} (${
            percentage.toFixed(2)}%)`;
        ctx.font = '12px Google Sans';
        const line1Width = ctx.measureText(line1).width;
        const line2Width = ctx.measureText(line2).width;
        const rectWidth = Math.max(line1Width, line2Width);
        const rectYStart = this.hoveredY + 10;
        const rectHeight = this.nodeHeight * 3;
        const rectYEnd = rectYStart + rectHeight;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(this.hoveredX + 5, rectYStart, rectWidth + 16, rectHeight);
        ctx.fillStyle = 'hsl(200, 50%, 40%)';
        ctx.textAlign = 'left';
        ctx.fillText(line1, this.hoveredX + 8, rectYStart + 18 /* 8 + 10s */);
        ctx.fillText(line2, this.hoveredX + 8, rectYEnd - 8);
      }
    }
  }

  private getCallsiteName(value: CallsiteInfo): string {
    return value.name === undefined ? 'unknown' : value.name;
  }

  onMouseMove({x, y}: {x: number, y: number}) {
    this.hoveredX = x;
    this.hoveredY = y;
    this.hoveredCallsite = this.findSelectedCallsite(x, y);
    const isCallsiteSelected = this.hoveredCallsite !== undefined;
    if (!isCallsiteSelected) {
      this.onMouseOut();
    }
    return isCallsiteSelected;
  }

  onMouseOut() {
    this.hoveredX = -1;
    this.hoveredY = -1;
    this.hoveredCallsite = undefined;
  }

  onMouseClick({x, y}: {x: number, y: number}) {
    this.clickedCallsite = this.findSelectedCallsite(x, y);
    return this.clickedCallsite !== undefined;
  }

  private findSelectedCallsite(x: number, y: number): CallsiteInfo|undefined {
    const depth = Math.trunc(y / this.nodeHeight) - 1;  // at 0 is root
    if (depth >= 0 && this.xStartsPerDepth.has(depth)) {
      const startX = this.searchSmallest(this.xStartsPerDepth.get(depth)!, x);
      const result = this.graphData.get(`${depth};${startX}`);
      if (result !== undefined) {
        const width = result.width;
        return startX + width >= x ? result.callsite : undefined;
      }
    }
    return undefined;
  }

  searchSmallest(haystack: number[], needle: number): number {
    haystack = haystack.sort((n1, n2) => n1 - n2);
    const [left, ] = searchSegment(haystack, needle);
    return left === -1 ? -1 : haystack[left];
  }
}
