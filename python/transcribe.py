import sys
import os
import whisper
import argparse

def create_srt(segments, srt_path, max_words=0, highlight_color=None):
    def format_time(seconds):
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        mills = int((seconds - int(seconds)) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{mills:03d}"

    with open(srt_path, 'w', encoding='utf-8') as f:
        srt_index = 1
        for segment in segments:
            if 'words' not in segment:
                # Fallback to standard behavior if no words
                start = format_time(segment['start'])
                end = format_time(segment['end'])
                text = segment['text'].strip()
                f.write(f"{srt_index}\n{start} --> {end}\n{text}\n\n")
                srt_index += 1
                continue

            words = segment['words']
            
            # Chunk words based on max_words
            chunks = []
            if max_words > 0:
                for i in range(0, len(words), max_words):
                    chunks.append(words[i:i + max_words])
            else:
                chunks = [words]
            
            for chunk in chunks:
                if not chunk: continue
                
                if highlight_color:
                    # Output a separate SRT block for every word in the chunk
                    for i, target_word in enumerate(chunk):
                        start = format_time(target_word['start'])
                        end = format_time(target_word['end'])
                        
                        # Build the line text with HTML formatting
                        line_parts = []
                        for j, w in enumerate(chunk):
                            word_text = w['word'].strip()
                            if j == i:
                                line_parts.append(f'<font color="{highlight_color}">{word_text}</font>')
                            else:
                                line_parts.append(word_text)
                        
                        line_text = " ".join(line_parts)
                        f.write(f"{srt_index}\n{start} --> {end}\n{line_text}\n\n")
                        srt_index += 1
                else:
                    # Output one block for the entire chunk
                    start = format_time(chunk[0]['start'])
                    end = format_time(chunk[-1]['end'])
                    line_text = " ".join(w['word'].strip() for w in chunk)
                    f.write(f"{srt_index}\n{start} --> {end}\n{line_text}\n\n")
                    srt_index += 1

def main():
    parser = argparse.ArgumentParser(description="Transcribe audio using Whisper")
    parser.add_argument("audio_path", help="Path to the audio file")
    parser.add_argument("--model", default="base", help="Whisper model to use")
    parser.add_argument("--language", default=None, help="Language code")
    parser.add_argument("--max-words", type=int, default=0, help="Max words per subtitle line")
    parser.add_argument("--highlight-color", default=None, help="Hex color code for word highlighting")
    args = parser.parse_args()

    audio_path = args.audio_path
    if not os.path.exists(audio_path):
        print(f"Error: Audio file not found at {audio_path}")
        sys.exit(1)

    srt_path = os.path.splitext(audio_path)[0] + ".srt"

    try:
        print(f"Loading Whisper model '{args.model}'...")
        model = whisper.load_model(args.model)
        
        print("Transcribing...")
        transcribe_args = {"fp16": False} # fp16 false avoids warnings on CPU
        if args.language:
            transcribe_args["language"] = args.language
            
        if args.max_words > 0 or args.highlight_color:
            transcribe_args["word_timestamps"] = True
            
        result = model.transcribe(audio_path, **transcribe_args)
        
        print("Generating SRT file...")
        create_srt(result['segments'], srt_path, args.max_words, args.highlight_color)
        
        print(f"Success: {srt_path}")
        sys.exit(0)
        
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
