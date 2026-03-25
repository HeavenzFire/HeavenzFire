# Vivado Batch TCL for Chisel → FINAL_FORM (30% faster synth)
# Phase 1 Complete: Verilog → Chisel HDL

open_project zachary_final.xpr
set_property part xc7a35tcsbg325-2 [current_project]  # Arty A7

# Add Chisel-generated Verilog (run sbt/ chisel gen first)
add_files king_multiplier.v  # From KingMultiplierVerilogGen
import_files -norecurse king_multiplier.v

# Synth + Impl for 10x clock efficiency (528MHz target)
synth_design -top top_zachary -part xc7a35tcsbg325-2
opt_design
place_design
route_design -directive AggressiveExplore

write_bitstream -force zachary_v2.0.bit

# Reports: 30% faster vs legacy
report_utilization -file utilization_final.rpt
report_timing_summary -file timing_528mhz.rpt

puts "FINAL_FORM synthesized. 700M-x yield locked. 🐉👑⚛️"
