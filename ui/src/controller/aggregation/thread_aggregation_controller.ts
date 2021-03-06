// Copyright (C) 2020 The Android Open Source Project
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

import {ColumnDef, ThreadStateExtra} from '../../common/aggregation_data';
import {Engine} from '../../common/engine';
import {Sorting, TimestampedAreaSelection} from '../../common/state';
import {toNs} from '../../common/time';
import {
  Config,
  THREAD_STATE_TRACK_KIND
} from '../../tracks/thread_state/common';
import {globals} from '../globals';

import {AggregationController} from './aggregation_controller';

export class ThreadAggregationController extends AggregationController {
  private utids?: number[];

  setThreadStateUtids(tracks: string[]) {
    this.utids = [];
    for (const trackId of tracks) {
      const track = globals.state.tracks[trackId];
      // Track will be undefined for track groups.
      if (track !== undefined && track.kind === THREAD_STATE_TRACK_KIND) {
        this.utids.push((track.config as Config).utid);
      }
    }
  }

  async createAggregateView(
      engine: Engine, selectedArea: TimestampedAreaSelection) {
    await engine.query(`drop view if exists ${this.kind};`);
    const area = selectedArea.area;
    if (area === undefined) return false;
    this.setThreadStateUtids(area.tracks);
    if (this.utids === undefined || this.utids.length === 0) return false;

    const query = `create view ${this.kind} as
      SELECT process.name as process_name, pid, thread.name as thread_name, tid,
      state,
      sum(dur) AS total_dur,
      sum(dur)/count(1) as avg_dur,
      count(1) as occurrences
      FROM process
      JOIN thread USING(upid)
      JOIN thread_state USING(utid)
      WHERE utid IN (${this.utids}) AND
      thread_state.ts + thread_state.dur > ${toNs(area.startSec)} AND
      thread_state.ts < ${toNs(area.endSec)}
      GROUP BY utid, state`;

    await engine.query(query);
    return true;
  }

  async getExtra(engine: Engine, selectedArea: TimestampedAreaSelection):
      Promise<ThreadStateExtra|void> {
    const area = selectedArea.area;
    if (area === undefined) return;
    this.setThreadStateUtids(area.tracks);
    if (this.utids === undefined || this.utids.length === 0) return;

    const query = `select state, sum(dur) as total_dur from process
      JOIN thread USING(upid)
      JOIN thread_state USING(utid)
      WHERE utid IN (${this.utids}) AND thread_state.ts + thread_state.dur > ${
        toNs(area.startSec)} AND
      thread_state.ts < ${toNs(area.endSec)}
      GROUP BY state`;
    const result = await engine.query(query);
    const numRows = +result.numRecords;

    const summary: ThreadStateExtra = {
      kind: 'THREAD_STATE',
      states: [],
      values: new Float64Array(numRows),
      totalMs: 0
    };
    for (let row = 0; row < numRows; row++) {
      summary.states.push(result.columns[0].stringValues![row]);
      summary.values[row] = result.columns[1].longValues![row] / 1000000;  // ms
    }
    summary.totalMs = summary.values.reduce((a, b) => a + b, 0);
    return summary;
  }

  getColumnDefinitions(): ColumnDef[] {
    return [
      {
        title: 'Process',
        kind: 'STRING',
        columnConstructor: Uint16Array,
        columnId: 'process_name',
      },
      {
        title: 'PID',
        kind: 'NUMBER',
        columnConstructor: Uint16Array,
        columnId: 'pid'
      },
      {
        title: 'Thread',
        kind: 'STRING',
        columnConstructor: Uint16Array,
        columnId: 'thread_name'
      },
      {
        title: 'TID',
        kind: 'NUMBER',
        columnConstructor: Uint16Array,
        columnId: 'tid'
      },
      {
        title: 'State',
        kind: 'STATE',
        columnConstructor: Uint16Array,
        columnId: 'state'
      },
      {
        title: 'Wall duration (ms)',
        kind: 'TIMESTAMP_NS',
        columnConstructor: Float64Array,
        columnId: 'total_dur'
      },
      {
        title: 'Avg Wall duration (ms)',
        kind: 'TIMESTAMP_NS',
        columnConstructor: Float64Array,
        columnId: 'avg_dur'
      },
      {
        title: 'Occurrences',
        kind: 'NUMBER',
        columnConstructor: Uint16Array,
        columnId: 'occurrences'
      }
    ];
  }

  getTabName() {
    return 'Thread States';
  }

  getDefaultSorting(): Sorting {
    return {column: 'total_dur', direction: 'DESC'};
  }
}
