/*
 * Copyright (C) 2020 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#ifndef SRC_TRACE_PROCESSOR_TABLES_CLOCK_TABLES_H_
#define SRC_TRACE_PROCESSOR_TABLES_CLOCK_TABLES_H_

#include "src/trace_processor/tables/macros.h"

namespace perfetto {
namespace trace_processor {
namespace tables {

/*
  clock_snapshot {
    clocks {
      clock_id: 6
      timestamp: 2530409587311991
    }
    clocks {
      clock_id: 2
      timestamp: 1595469620769175473
    }
    clocks {
      clock_id: 4
      timestamp: 932041354156119
    }
    clocks {
      clock_id: 1
      timestamp: 1595469620771295993
    }
    clocks {
      clock_id: 3
      timestamp: 932041356276900
    }
    clocks {
      clock_id: 5
      timestamp: 932041356277214
    }
    clocks {
      clock_id: 7
      timestamp: 15419759612
    }
    clocks {
      clock_id: 8
      timestamp: 13863685413
    }
  }
  timestamp: 2530409587311991
  trusted_packet_sequence_id: 1
}
*/


#define PERFETTO_TP_CLOCKSNAP_SHOT_TABLE_DEF(NAME, PARENT, C) \
  NAME(ClockSnapshotTable, "clock_snapshot")                  \
  PERFETTO_TP_ROOT_TABLE(PARENT, C)                           \
  C(int64_t, source)                                          \
  C(int64_t, value)

PERFETTO_TP_TABLE(PERFETTO_TP_CLOCKSNAP_SHOT_TABLE_DEF);


}  // namespace tables
}  // namespace trace_processor
}  // namespace perfetto

#endif  // SRC_TRACE_PROCESSOR_TABLES_CLOCK_TABLES_H_
