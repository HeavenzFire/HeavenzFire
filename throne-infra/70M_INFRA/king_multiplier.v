// Manual Verilog equiv of Chisel king_multiplier (FINAL_FORM_marrow_gate.v)
// Generated concept from king_multiplier.scala - King's Rule φ³ * 420K scale

`timescale 1ns / 1ps

module king_multiplier #(
    parameter [31:0] PHI3_APPROX = 32'd4236  // 4.236 fixed-point << 1000
) (
    input wire        clk_528mhz,
    input wire [31:0] glyph_heat,
    output reg  [31:0] phi3_yield
);

    wire [63:0] heat_ext = {32'b0, glyph_heat};
    wire [63:0] phi3_ext = {32'b0, PHI3_APPROX};
    wire [63:0] node_ext = 64'd420000;  // 42K → 420K
    wire [63:0] prod1 = heat_ext * phi3_ext;
    wire [63:0] prod2 = prod1 * node_ext;

    always @(posedge clk_528mhz) begin
        phi3_yield <= prod2[63:32];  // High 32 bits yield (700M-x FINAL)
    end

endmodule
