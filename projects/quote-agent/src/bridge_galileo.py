import os
import json
import argparse
import shutil
from datetime import datetime
from create_estimate import create_integrated_document

def main():
    parser = argparse.ArgumentParser(description="Bridge script to convert Galileo summary JSON to integrated estimate excel.")
    parser.add_argument("--summary", required=True, help="Path to the estimate_summary.json from Galileo")
    parser.add_argument("--dest", required=True, help="Destination directory to save the generated excel file")
    
    args = parser.parse_args()
    
    with open(args.summary, "r", encoding="utf-8") as f:
        galileo_data = json.load(f)
        
    model_name = galileo_data.get("model", "Unknown Model")
    pricing = galileo_data.get("pricing", {})
    stats = galileo_data.get("stats", {})
    
    price = pricing.get("suggested_price", 0)
    time_str = stats.get("total_time_raw", "")
    weight = stats.get("filament_g", 0)
    
    note_str = f"소요시간: {time_str} / 필라멘트: {weight}g"
    
    # Input data format for create_estimate.py
    estimate_input = {
        "recipient": "웹 요청 고객",
        "contact": "-",
        "email": "-",
        "address": "-",
        "shipping_method": "방문수령", # 배송비 기본 0원으로 하기 위해 변경
        "shipping_fee": 0,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "items": [
            {
                "name": f"{model_name} (3D 프린팅)",
                "quantity": 1,
                "price": price,
                "note": note_str,
                "code": "3D-PRT-01"
            }
        ]
    }
    
    # Generate the excel file using the existing logic (will save to default OUTPUT_DIR)
    excel_path = create_integrated_document(estimate_input)
    
    if os.path.exists(excel_path):
        filename = os.path.basename(excel_path)
        dest_path = os.path.join(args.dest, filename)
        
        # Copy to the requested destination directory
        os.makedirs(args.dest, exist_ok=True)
        shutil.copy2(excel_path, dest_path)
        
        print(f"SUCCESS:{dest_path}")
    else:
        print("ERROR:Failed to generate excel file")

if __name__ == "__main__":
    main()
