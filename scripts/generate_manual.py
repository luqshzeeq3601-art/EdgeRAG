"""Script to generate the ECP-2400 technical manual PDF for EdgeRAG evaluation."""

from __future__ import annotations

from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject


def build_manual_pdf(output_path: Path) -> Path:
    writer = PdfWriter()
    font = writer._add_object(
        DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
    )

    pages_content = [
        # Page 1: General Specifications
        [
            "ECP-2400 EMERGENCY COOLING PUMP SYSTEM - TECHNICAL MANUAL",
            "Document ID: ECP-2400-OM-REV4 | Department: Industrial Fluid Dynamics",
            "",
            "1. GENERAL SPECIFICATIONS AND PERFORMANCE",
            "The Model ECP-2400 is an industrial emergency cooling pump skid designed for critical",
            "heat exchange and thermal plant containment operations.",
            "",
            "1.1 Operational Ratings",
            "- Nominal operating speed: 2400 RPM (direct drive synchronous coupling).",
            "- Maximum allowable operating pressure: 12.5 bar (test pressure 18.75 bar).",
            "- Rated liquid flow rate: 350 L/min at nominal speed under standard ambient conditions.",
            "- Maximum suction lift capability: 6.2 meters at sea level (101.3 kPa barometric pressure).",
            "- Permissible particulate size in pumped media: maximum 0.5 mm non-abrasive suspended solids.",
            "",
            "1.2 Skid Dimensions and Physical Characteristics",
            "- Total skid assembly dry weight: 420 kg (operating weight 465 kg with flooded casing).",
            "- Skid footprint dimensions: 1200 mm length by 800 mm width (overall height 950 mm).",
            "- Suction flange diameter: DN80 PN16; Discharge flange diameter: DN50 PN16.",
        ],
        # Page 2: Lubrication and Maintenance
        [
            "ECP-2400 EMERGENCY COOLING PUMP SYSTEM - MAINTENANCE & LUBRICATION",
            "Document ID: ECP-2400-OM-REV4 | Section 2: Servicing Schedules",
            "",
            "2. LUBRICATION, SEALS, AND MECHANICAL WEAR LIMITS",
            "",
            "2.1 Lubricant Specifications",
            "- Specified lubricant for bearing housings: ISO VG 46 synthetic gear and bearing oil.",
            "- Oil reservoir capacity: 1.8 liters per bearing housing.",
            "- Oil change interval: 2000 operating hours or annually, whichever occurs first.",
            "",
            "2.2 Mechanical Seal and Alignment Inspection",
            "- Primary mechanical seal assembly inspection interval: conduct inspection every 500 operating hours.",
            "- Check seal faces for scorch marks, carbon deposit buildup, or elastomer deterioration.",
            "- Shaft alignment checks: conduct laser or dial indicator alignment checks every 3 months",
            "  or immediately following any major maintenance intervention or motor relocation.",
            "",
            "2.3 Fastener Torques and Impeller Wear Rings",
            "- Casing flange M16 assembly bolts: tighten sequentially in a cross-star pattern to 85 Nm.",
            "- Impeller wear ring replacement schedule: inspect radial clearance annually. Wear rings",
            "  must be replaced whenever the measured radial clearance exceeds 0.8 mm (nominal clearance is 0.25 to 0.35 mm).",
        ],
        # Page 3: Safety Limits, Electrical, and Air Bleeding
        [
            "ECP-2400 EMERGENCY COOLING PUMP SYSTEM - SAFETY, ELECTRICAL & STARTUP",
            "Document ID: ECP-2400-OM-REV4 | Section 3: Commissioning Procedures",
            "",
            "3. VIBRATION, THERMAL THRESHOLDS, ELECTRICAL SUPPLY & AIR BLEEDING",
            "",
            "3.1 Vibration and Temperature Safety Thresholds",
            "- Normal baseline overall vibration: below 2.2 mm/s RMS velocity.",
            "- Cavitation warning threshold: vibration levels exceeding 4.5 mm/s RMS indicate severe cavitation;",
            "  operators must immediately verify suction net positive suction head (NPSH) and throttle discharge.",
            "- Emergency shutdown bearing temperature: 95 C (alarm warning trips at 85 C; automatic trip at 95 C).",
            "",
            "3.2 Electrical Power Supply Requirements",
            "- Power supply: 3-phase 400V AC at 50 Hz (tolerance +/- 5%).",
            "- Motor power rating: 15 kW induction motor, rated full-load current 28.5 Amperes.",
            "",
            "3.3 Mandatory Pre-Startup Air Bleeding Procedure",
            "Before energizing the pump motor, all trapped air must be completely purged:",
            "  Step 1: Open manual air vent valve V-2 located at the high point of the pump discharge casing.",
            "  Step 2: Slowly crack open the suction line isolation valve to prime the impeller eye with fluid.",
            "  Step 3: Allow liquid to displace trapped air until a solid, bubble-free fluid stream emerges from V-2.",
            "  Step 4: Securely close manual vent valve V-2 and verify zero gland leakage prior to startup.",
        ],
    ]

    for lines in pages_content:
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        stream = DecodedStreamObject()
        content_parts = ["BT", "/F1 10 Tf", "14 TL", "54 740 Td"]
        for line in lines:
            escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            content_parts.append(f"({escaped}) Tj")
            content_parts.append("T*")
        content_parts.append("ET")
        stream.set_data(" \n".join(content_parts).encode("latin-1"))
        page[NameObject("/Contents")] = writer._add_object(stream)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as f:
        writer.write(f)

    return output_path


if __name__ == "__main__":
    path = Path("data/documents/ECP-2400_Emergency_Cooling_Pump_Manual.pdf")
    build_manual_pdf(path)
    print(f"Generated manual at: {path}")
